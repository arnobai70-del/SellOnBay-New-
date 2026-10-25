import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupStorage, listAll, readStorageZip, restoreStorage } from './storage-copy.mjs';

// A stand-in for supabase-js storage: list() answers one folder level, folders have id null, like the real API.
function fakeClient(store) {
  const level = (bucket, prefix) => {
    const seen = new Map();
    for (const p of Object.keys(store[bucket] ?? {})) {
      if (prefix && !p.startsWith(prefix + '/')) continue;
      const rest = prefix ? p.slice(prefix.length + 1) : p;
      const [head, ...more] = rest.split('/');
      if (!seen.has(head)) seen.set(head, more.length ? { name: head, id: null } : { name: head, id: 'id-' + p });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  return {
    storage: {
      listBuckets: async () => ({ data: Object.keys(store).map((id) => ({ id, public: false })), error: null }),
      getBucket: async (id) => (store[id] ? { data: { id }, error: null } : { data: null, error: { message: 'not found' } }),
      from: (bucket) => ({
        list: async (prefix, { limit, offset }) => ({ data: level(bucket, prefix).slice(offset, offset + limit), error: null }),
        download: async (p) => ({ data: new Blob([store[bucket][p]], { type: 'image/png' }), error: null }),
        upload: async (p, u8) => {
          store[bucket][p] = Buffer.from(u8);
          return { error: null };
        },
      }),
    },
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sob-files-test-'));
const live = {
  demos: { 'site-a/index.html': Buffer.from('<h1>A</h1>'), 'site-a/img/logo.png': Buffer.from([1, 2, 3]), 'trial/x/trial.txt': Buffer.from('trial') },
  certificates: { 'o1.pdf': Buffer.from('%PDF-1.7') },
};

test('every file in every bucket, folders included, goes into the zip and back unchanged', async () => {
  const zip = path.join(dir, 'files.zip');
  const manifest = await backupStorage(fakeClient(live), zip);
  assert.deepEqual(Object.keys(manifest.buckets.demos.files).sort(), ['site-a/img/logo.png', 'site-a/index.html', 'trial/x/trial.txt']);
  const { files } = readStorageZip(zip);
  assert.equal(files.length, 4);
  const target = { demos: {}, certificates: {} };
  await restoreStorage(fakeClient(target), files);
  for (const b of Object.keys(live)) for (const [p, v] of Object.entries(live[b])) assert.deepEqual(target[b][p], v);
});

test('a damaged zip is refused', async () => {
  const zip = path.join(dir, 'files2.zip');
  await backupStorage(fakeClient(live), zip);
  const bytes = fs.readFileSync(zip);
  const at = bytes.indexOf(Buffer.from('<h1>A</h1>'));
  bytes[at + 1] ^= 1;
  fs.writeFileSync(zip, bytes);
  assert.throws(() => readStorageZip(zip), /damaged/);
});

test('listing walks past a full page', async () => {
  const many = { big: Object.fromEntries(Array.from({ length: 1005 }, (_, i) => [`f${String(i).padStart(4, '0')}`, Buffer.from('x')])) };
  assert.equal((await listAll(fakeClient(many).storage.from('big'))).length, 1005);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
