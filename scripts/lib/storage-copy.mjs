// Copies every file in Supabase Storage into one zip, and back. Used by storage-backup.mjs and storage-restore.mjs; the Supabase client is
// passed in, so the tests can use a stand-in. Zip layout: <bucket>/<path>, plus manifest.json with each file's size and sha256.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Zip, ZipPassThrough, unzipSync } from 'fflate';

const PAGE = 1000;

/** Every file path in one bucket. Folders come back from list() with no id, so they are walked into. */
export async function listAll(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Could not list "${prefix || '/'}": ${error.message}`);
    for (const e of data ?? []) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null || e.id === undefined) out.push(...(await listAll(bucket, full)));
      else out.push(full);
    }
    if (!data || data.length < PAGE) return out;
  }
}

const sha = (u8) => crypto.createHash('sha256').update(u8).digest('hex');

/** Writes all buckets into `file` (a zip). Returns the manifest. */
export async function backupStorage(client, file) {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw new Error('Could not list the buckets: ' + error.message);
  const out = fs.createWriteStream(file, { mode: 0o600 });
  const done = new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) out.destroy(err);
    else {
      out.write(chunk);
      if (final) out.end();
    }
  });
  const add = (name, u8) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(u8, true);
  };
  const manifest = { made: new Date().toISOString(), buckets: {} };
  for (const b of buckets ?? []) {
    const bucket = client.storage.from(b.id);
    const files = {};
    for (const path of await listAll(bucket)) {
      const { data, error: e } = await bucket.download(path);
      if (e || !data) throw new Error(`Could not download ${b.id}/${path}: ${e?.message ?? 'empty answer'}`);
      const u8 = new Uint8Array(await data.arrayBuffer());
      add(`${b.id}/${path}`, u8);
      files[path] = { bytes: u8.length, sha256: sha(u8), type: data.type || 'application/octet-stream' };
    }
    manifest.buckets[b.id] = { public: !!b.public, files };
  }
  add('manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  zip.end();
  await done;
  return manifest;
}

/** Reads a zip made by backupStorage and checks every file against the manifest. Throws on any mismatch. */
export function readStorageZip(file) {
  const all = unzipSync(new Uint8Array(fs.readFileSync(file)));
  if (!all['manifest.json']) throw new Error('This zip has no manifest.json; it was not made by storage-backup.');
  const manifest = JSON.parse(new TextDecoder().decode(all['manifest.json']));
  const files = [];
  for (const [bucket, { files: list }] of Object.entries(manifest.buckets)) {
    for (const [path, meta] of Object.entries(list)) {
      const u8 = all[`${bucket}/${path}`];
      if (!u8 || u8.length !== meta.bytes || sha(u8) !== meta.sha256) throw new Error(`${bucket}/${path} is missing or damaged in the backup.`);
      files.push({ bucket, path, u8, type: meta.type });
    }
  }
  return { manifest, files };
}

/** Uploads every file back. The buckets must exist already (the migrations create them). */
export async function restoreStorage(client, files) {
  for (const f of files) {
    const { error } = await client.storage.from(f.bucket).upload(f.path, f.u8, { contentType: f.type, upsert: true });
    if (error) throw new Error(`Could not upload ${f.bucket}/${f.path}: ${error.message}`);
  }
}
