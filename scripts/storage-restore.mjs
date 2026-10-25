// Puts the files from storage-backup.mjs back into a Supabase project, normally the NEW one a database restore went into.
// The buckets must exist (apply the migrations first). A bucket that already has files is refused unless --merge is given.
//
// Usage:  RESTORE_SUPABASE_URL=... RESTORE_SERVICE_ROLE_KEY=... BACKUP_PASSPHRASE=... node scripts/storage-restore.mjs <file> --yes
//   Separate names from the live keys on purpose, so the live project is never the target by accident.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decryptFile } from './lib/backup-file.mjs';
import { listAll, readStorageZip, restoreStorage } from './lib/storage-copy.mjs';

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const url = process.env.RESTORE_SUPABASE_URL;
const key = process.env.RESTORE_SERVICE_ROLE_KEY;
if (!file || !fs.existsSync(file)) fail('Give the backup file: node scripts/storage-restore.mjs <file> --yes');
if (!url || !key) fail('Set RESTORE_SUPABASE_URL and RESTORE_SERVICE_ROLE_KEY to the NEW project.');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sob-files-'));
try {
  let zip = file;
  if (file.endsWith('.enc')) {
    zip = path.join(tmp, 'files.zip');
    await decryptFile(file, zip, process.env.BACKUP_PASSPHRASE);
  }
  const { manifest, files } = readStorageZip(zip);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const b of Object.keys(manifest.buckets)) {
    const { error } = await client.storage.getBucket(b);
    if (error) throw new Error(`The target has no bucket "${b}". Apply every file in supabase/migrations to it first.`);
    if (!process.argv.includes('--merge') && (await listAll(client.storage.from(b))).length)
      throw new Error(`Bucket "${b}" in the target already has files. Use a new project, or add --merge to add these files to it.`);
  }
  if (!process.argv.includes('--yes')) throw new Error(`Checks passed: ${files.length} files are ready. Run again with --yes to upload them.`);
  await restoreStorage(client, files);
  console.log(`Restored ${files.length} files.`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true }); // the decrypted copy never stays on disk
}
