// Backup of the uploaded files (Supabase Storage: hosted demos, pictures, trial copies, certificates), encrypted. Pairs with db-backup.mjs,
// which has the database rows but not these files.
//
// Usage:  NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BACKUP_PASSPHRASE=... node scripts/storage-backup.mjs
//   The service role key reads every private file: run this only on a machine you trust, and never commit the key.
//   BACKUP_DIR (default ./backups) and BACKUP_KEEP (default 14) work as in db-backup.mjs. --plain writes an unencrypted zip on purpose.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { checkPassphrase, encryptFile, sha256 } from './lib/backup-file.mjs';
import { backupStorage, readStorageZip } from './lib/storage-copy.mjs';

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const plain = process.argv.includes('--plain');
const pass = process.env.BACKUP_PASSPHRASE;
const dir = path.resolve(process.env.BACKUP_DIR || 'backups');
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);

if (!url || !key) fail('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase > Settings > API).');
if (!plain) {
  try {
    checkPassphrase(pass);
  } catch (e) {
    fail(e.message);
  }
}

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const zip = path.join(dir, `sellonbay-files-${stamp}.zip`);
try {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const manifest = await backupStorage(client, zip);
  readStorageZip(zip); // read it back and check every file before trusting it
  const counts = Object.entries(manifest.buckets).map(([b, { files }]) => `${b} ${Object.keys(files).length}`);
  let file = zip;
  if (!plain) {
    file = zip + '.enc';
    await encryptFile(zip, file, pass);
    fs.rmSync(zip);
  }
  console.log(`Saved ${file}`);
  console.log(`  files: ${counts.join(', ') || 'none'}; ${(fs.statSync(file).size / 1024 / 1024).toFixed(2)} MB, sha256 ${await sha256(file)}`);
} catch (e) {
  fs.rmSync(zip, { force: true });
  fail(e.message + ' Nothing was saved.');
}

const old = fs
  .readdirSync(dir)
  .filter((f) => /^sellonbay-files-\d{8}-\d{6}\.zip(\.enc)?$/.test(f))
  .sort()
  .reverse()
  .slice(keep);
for (const f of old) {
  fs.rmSync(path.join(dir, f));
  console.log(`  removed old backup ${f}`);
}
