// Migration-history reconciliation helper (docs/LAUNCH_READINESS.md section 1). Never connects to a real database: the expected
// fingerprints come from applying every migration to an in-process Postgres (PGlite), like scripts/check-migrations.mjs.
//   node scripts/migration-probe.mjs                                   prints the SELECT-only probe SQL
//   node scripts/migration-probe.mjs --classify history.json probe.json prints the verdict per migration
// history.json: the rows of `select version, name from supabase_migrations.schema_migrations`; probe.json: the probe's rows (JSON arrays).
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classify, fingerprintSql, probePlan, probeSql, withHashes } from './lib/migrationProbe.mjs';
import { forPglite, migrationFiles, STAND_INS } from './lib/pgliteSupabase.mjs';

/* The probe plan with the fingerprints every migration leaves behind. */
export async function expectedPlan(files = migrationFiles()) {
  const plan = probePlan(files);
  const db = new PGlite();
  await db.exec(STAND_INS);
  for (const { sql } of files) await db.exec(forPglite(sql));
  const q = fingerprintSql(plan);
  const rows = q ? (await db.query(q)).rows : [];
  await db.close();
  return withHashes(plan, rows);
}

if (process.argv[1] && import.meta.filename === (await import('node:path')).resolve(process.argv[1])) {
  const plan = await expectedPlan();
  const [flag, historyFile, probeFile] = process.argv.slice(2);
  if (flag === '--classify') {
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const r of classify(plan, read(historyFile), read(probeFile)))
      console.log(`${r.version}\t${r.recorded ? 'recorded' : '-'}\t${r.present ?? '?'}/${r.objects}\t${r.verdict}${r.missing ? `\t(missing: ${r.missing})` : ''}`);
  } else process.stdout.write(probeSql(plan));
}
