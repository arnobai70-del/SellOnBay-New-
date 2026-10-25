// Daily database backup: the data of the app's own tables (schema public) and the accounts (schema auth), encrypted.
// The tables themselves come back from supabase/migrations, so a restore is: new project, apply the migrations, then db-restore.mjs.
// Uploaded files (Storage buckets) are NOT in this file; see docs/RUNBOOK.md.
//
// Usage:  SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... node scripts/db-backup.mjs
//   SUPABASE_DB_URL    Supabase > Connect > "Session pooler" (port 5432) or the direct connection. Not the transaction pooler (6543).
//   BACKUP_PASSPHRASE  at least 16 characters; without it the script stops (add --plain to write an unencrypted file on purpose).
//   BACKUP_DIR         where files go (default ./backups, which git ignores). Copy them somewhere off this machine as well.
//   BACKUP_KEEP        how many backups to keep in BACKUP_DIR (default 14); older ones are deleted.
// pg_dump may warn about circular foreign keys on orders: expected, db-restore.mjs loads the rows with those checks paused.
// Needs pg_dump and pg_restore of the same major version as the database or newer (Supabase shows the version under Settings > Infrastructure).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checkPassphrase, encryptFile, sha256 } from './lib/backup-file.mjs';

// Auth tables that are filled by Supabase itself in every project, or only hold short-lived logins. Copying them would clash or is not needed:
// after a restore everybody signs in again.
const SKIP_TABLES = ['auth.schema_migrations', 'auth.sessions', 'auth.refresh_tokens', 'auth.flow_state', 'auth.one_time_tokens', 'auth.mfa_challenges', 'auth.audit_log_entries'];

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const url = process.env.SUPABASE_DB_URL;
const plain = process.argv.includes('--plain');
const pass = process.env.BACKUP_PASSPHRASE;
const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

if (!url) fail('Set SUPABASE_DB_URL to the database connection string (Supabase > Connect > Session pooler).');
if (/:6543\//.test(url)) fail('This is the transaction pooler (port 6543). pg_dump needs the session pooler (5432) or the direct connection.');
if (!plain) {
  try {
    checkPassphrase(pass);
  } catch (e) {
    fail(e.message);
  }
}
for (const tool of ['pg_dump', 'pg_restore']) {
  if (spawnSync(tool, ['--version']).status !== 0) fail(`${tool} was not found. Install the PostgreSQL client tools and try again.`);
}

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const dump = path.join(dir, `sellonbay-${stamp}.dump`);
const args = [
  '--format=custom',
  '--data-only',
  '--schema=public',
  '--schema=auth',
  ...SKIP_TABLES.map((t) => `--exclude-table-data=${t}`),
  '--no-owner',
  '--no-privileges',
  `--file=${dump}`,
  `--dbname=${url}`,
];
const run = spawnSync('pg_dump', args, { stdio: ['ignore', 'inherit', 'inherit'] });
if (run.status !== 0) {
  fs.rmSync(dump, { force: true });
  fail('pg_dump failed (see above). Nothing was saved.');
}
// Read the file back before trusting it.
const list = spawnSync('pg_restore', ['--list', dump], { encoding: 'utf8' });
if (list.status !== 0) {
  fs.rmSync(dump, { force: true });
  fail('The new backup could not be read back, so it was deleted. ' + list.stderr);
}
const tables = list.stdout.split('\n').filter((l) => / TABLE DATA /.test(l)).length;

let file = dump;
if (!plain) {
  file = dump + '.enc';
  await encryptFile(dump, file, pass);
  fs.rmSync(dump);
}
console.log(`Saved ${file}`);
console.log(`  ${tables} tables, ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB, sha256 ${await sha256(file)}`);

const old = fs
  .readdirSync(dir)
  .filter((f) => /^sellonbay-\d{8}-\d{6}\.dump(\.enc)?$/.test(f))
  .sort()
  .reverse()
  .slice(keep);
for (const f of old) {
  fs.rmSync(path.join(dir, f));
  console.log(`  removed old backup ${f}`);
}
