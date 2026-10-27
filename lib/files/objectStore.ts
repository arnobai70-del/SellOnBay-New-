import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseConfigured } from '../supabase/env';
import { adminClientAvailable, createAdminClient } from '../supabase/server';
import type { RangeReader } from './zipIndex';

/*
 * Private object storage for source files (owner decision D-D). Two buckets, both private, written only by the server:
 *   quarantine     uploads land here, are checked, and wait for review; rejected ones are deleted after the retention period
 *   product-files  approved files only, copied once from quarantine, never overwritten or deleted by the app
 * Supabase Storage in production; memory in tests and demo mode. Nothing here is ever served publicly: downloads go through the release rule.
 */
export const QUARANTINE = 'quarantine';
export const APPROVED = 'product-files';
export type Bucket = typeof QUARANTINE | typeof APPROVED;

export interface ObjectStore {
  kind: 'supabase' | 'memory';
  /* A one-time upload link straight into quarantine, so large files never pass through the web server. */
  uploadUrl(path: string): Promise<{ url: string; token: string }>;
  /* A server-side write into quarantine (legacy imports). Never into product-files. */
  putQuarantine(path: string, data: Uint8Array): Promise<void>;
  size(bucket: Bucket, path: string): Promise<number | null>;
  reader(bucket: Bucket, path: string): Promise<RangeReader>;
  sha256(bucket: Bucket, path: string): Promise<string>;
  /* Copies quarantine -> product-files. Refuses to overwrite: an approved path is written once. */
  promote(fromPath: string, toPath: string): Promise<void>;
  remove(bucket: Bucket, path: string): Promise<void>;
  /* A short-lived private link, used only after the release rule allowed the download. */
  signedUrl(bucket: Bucket, path: string, seconds: number): Promise<string>;
}

export class ObjectStoreError extends Error {}

/* ---------- memory (tests, demo mode) ---------- */
const mem: Map<string, Uint8Array> = ((globalThis as { __objMem?: Map<string, Uint8Array> }).__objMem ??= new Map());
const k = (b: Bucket, p: string) => `${b}/${p}`;
export const memoryObjectStore: ObjectStore = {
  kind: 'memory',
  uploadUrl: async (path) => ({ url: `memory://${QUARANTINE}/${path}`, token: 'memory' }),
  putQuarantine: async (path, data) => {
    mem.set(k(QUARANTINE, path), data.slice());
  },
  size: async (b, p) => mem.get(k(b, p))?.byteLength ?? null,
  reader: async (b, p) => {
    const data = mem.get(k(b, p));
    if (!data) throw new ObjectStoreError('File not found.');
    return { size: data.byteLength, read: async (o, l) => data.subarray(o, Math.min(data.byteLength, o + l)) };
  },
  sha256: async (b, p) => {
    const data = mem.get(k(b, p));
    if (!data) throw new ObjectStoreError('File not found.');
    return createHash('sha256').update(data).digest('hex');
  },
  promote: async (from, to) => {
    const data = mem.get(k(QUARANTINE, from));
    if (!data) throw new ObjectStoreError('File not found.');
    if (mem.has(k(APPROVED, to))) throw new ObjectStoreError('An approved file is never overwritten.');
    mem.set(k(APPROVED, to), data.slice());
  },
  remove: async (b, p) => {
    if (b === APPROVED) throw new ObjectStoreError('Approved files are never deleted by the app.');
    mem.delete(k(b, p));
  },
  signedUrl: async (b, p) => `memory://${b}/${p}`,
};
/* Tests only: put bytes into quarantine as if the seller had uploaded them. */
export const memPut = (path: string, data: Uint8Array) => mem.set(k(QUARANTINE, path), data);
export const memTamper = (bucket: Bucket, path: string, data: Uint8Array) => mem.set(k(bucket, path), data);

/* ---------- Supabase Storage ---------- */
async function signed(b: Bucket, p: string, seconds = 300) {
  const { data, error } = await createAdminClient().storage.from(b).createSignedUrl(p, seconds);
  if (error || !data?.signedUrl) throw new ObjectStoreError('Could not reach the file.');
  return data.signedUrl;
}
export const supabaseObjectStore: ObjectStore = {
  kind: 'supabase',
  async uploadUrl(path) {
    const { data, error } = await createAdminClient().storage.from(QUARANTINE).createSignedUploadUrl(path);
    if (error || !data) throw new ObjectStoreError('Could not prepare the upload.');
    return { url: data.signedUrl, token: data.token };
  },
  async putQuarantine(path, data) {
    const { error } = await createAdminClient().storage.from(QUARANTINE).upload(path, data, { contentType: 'application/zip', upsert: false });
    if (error) throw new ObjectStoreError('Could not store the file in quarantine.');
  },
  async size(b, p) {
    const { data, error } = await createAdminClient().storage.from(b).info(p);
    if (error || !data) return null;
    return typeof data.size === 'number' ? data.size : null;
  },
  async reader(b, p) {
    const size = await this.size(b, p);
    if (size === null) throw new ObjectStoreError('File not found.');
    const url = await signed(b, p);
    return {
      size,
      async read(offset, length) {
        if (length <= 0) return new Uint8Array(0);
        const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
        if (res.status !== 206 && res.status !== 200) throw new ObjectStoreError('Could not read the file.');
        const buf = new Uint8Array(await res.arrayBuffer());
        // A server that ignores Range sends the whole file: take the part asked for.
        return res.status === 200 ? buf.subarray(offset, offset + length) : buf;
      },
    };
  },
  async sha256(b, p) {
    const res = await fetch(await signed(b, p));
    if (!res.ok || !res.body) throw new ObjectStoreError('Could not read the file.');
    const h = createHash('sha256');
    const rd = res.body.getReader();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      h.update(value);
    }
    return h.digest('hex');
  },
  async promote(from, to) {
    const st = createAdminClient().storage;
    const { data: there } = await st.from(APPROVED).exists(to);
    if (there) throw new ObjectStoreError('An approved file is never overwritten.');
    const { error } = await st.from(QUARANTINE).copy(from, to, { destinationBucket: APPROVED });
    if (error) throw new ObjectStoreError('Could not store the approved file.');
  },
  async remove(b, p) {
    if (b === APPROVED) throw new ObjectStoreError('Approved files are never deleted by the app.');
    const { error } = await createAdminClient().storage.from(b).remove([p]);
    if (error) throw new ObjectStoreError('Could not remove the file.');
  },
  signedUrl: (b, p, seconds) => signed(b, p, seconds),
};

export const objectStore = (): ObjectStore => (supabaseConfigured && adminClientAvailable() ? supabaseObjectStore : memoryObjectStore);
