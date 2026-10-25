// Put a backup made by db-backup.mjs into a NEW, EMPTY database. It never touches a database that already has accounts in it.
//
// Steps: 1) create a new Supabase project (or a staging one), 2) apply every file in supabase/migrations to it,
// 3) RESTORE_DB_URL=... BACKUP_PASSPHRASE=... node scripts/db-restore.mjs backups/sellonbay-YYYYMMDD-HHMMSS.dump.enc --yes
// RESTORE_DB_URL is a separate name from SUPABASE_DB_URL on purpose, so the live database is never the target by accident.
// The whole restore is one transaction: it either all goes in, or nothing does.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptFile } from './lib/backup-file.mjs';

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const url = process.env.RESTORE_DB_URL;
if (!file || !fs.existsSync(file)) fail('Give the backup file: node scripts/db-restore.mjs <file> --yes');
if (!url) fail('Set RESTORE_DB_URL to the NEW database (not the live one).');
if (/:6543\//.test(url)) fail('This is the transaction pooler (port 6543). Use the session pooler (5432) or the direct connection.');
for (const tool of ['pg_restore', 'psql']) {
  if (spawnSync(tool, ['--version']).status !== 0) fail(`${tool} was not found. Install the PostgreSQL client tools and try again.`);
}

const psql = (sql) => spawnSync('psql', ['--no-psqlrc', '--tuples-only', '--no-align', '--variable=ON_ERROR_STOP=1', `--dbname=${url}`, '--command', sql], { encoding: 'utf8' });

// The target must have the tables (migrations applied) and no accounts yet.
const pre = psql("select to_regclass('public.orders') is not null, to_regclass('public.profiles') is not null");
if (pre.status !== 0) fail('Could not connect to RESTORE_DB_URL. ' + pre.stderr);
if (pre.stdout.trim() !== 't|t') fail('The target has no SellOnBay tables. Apply every file in supabase/migrations to it first.');
const used = psql('select (select count(*) from auth.users) + (select count(*) from public.profiles)');
if (used.status !== 0) fail(used.stderr);
if (Number(used.stdout.trim()) > 0) fail('The target already has accounts in it. Restore only into a new, empty project.');
if (!process.argv.includes('--yes')) fail('Checks passed. Run again with --yes to restore.');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sob-restore-'));
try {
  let dump = file;
  if (file.endsWith('.enc')) {
    dump = path.join(tmp, 'backup.dump');
    await decryptFile(file, dump, process.env.BACKUP_PASSPHRASE);
  }
  const list = spawnSync('pg_restore', ['--list', dump], { encoding: 'utf8' });
  if (list.status !== 0) throw new Error('The backup could not be read. ' + list.stderr);
  // Migrations can seed a few rows (settings and the like). The backup has the live copy of those rows, so the seeded ones are cleared first.
  const publicTables = [...list.stdout.matchAll(/ TABLE DATA public (\S+) /g)].map((m) => `public."${m[1]}"`);
  const sql = path.join(tmp, 'data.sql');
  const out = spawnSync('pg_restore', ['--data-only', '--no-owner', '--no-privileges', `--file=${sql}`, dump], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error('Could not turn the backup into SQL. ' + out.stderr);

  // Same method as Supabase's own restore guide: foreign keys and triggers are paused while the rows go in (replica mode), in one transaction.
  const args = ['--no-psqlrc', '--quiet', '--single-transaction', '--variable=ON_ERROR_STOP=1', `--dbname=${url}`, '--command', 'set session_replication_role = replica'];
  if (publicTables.length) args.push('--command', `truncate table ${publicTables.join(', ')}`);
  args.push('--file', sql);
  const run = spawnSync('psql', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (run.status !== 0) throw new Error('The restore failed and was rolled back; the target is unchanged. See the error above.');

  const counts = psql(
    "select 'accounts ' || (select count(*) from auth.users) || ', profiles ' || (select count(*) from public.profiles) || ', listings ' || (select count(*) from public.products) || ', orders ' || (select count(*) from public.orders) || ', ledger entries ' || (select count(*) from public.ledger_entries)",
  );
  console.log('Restored. ' + counts.stdout.trim());
  console.log('Next: set the app to the new project keys, run the e2e tests against it, open one order and one listing by hand (docs/RUNBOOK.md).');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  // The decrypted copy never stays on disk.
  fs.rmSync(tmp, { recursive: true, force: true });
}
