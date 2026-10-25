import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import { generateLicenseKey } from './token';
import { CONFIG } from '../config';
import { clientAddress } from '../clientIp';

/* Server-side helpers for delivering files: the signing secret, rate limits, licence keys and the download log. */

const g = globalThis as { __deliverySecret?: string; __limits?: Map<string, number[]>; __licenses?: Map<string, string>; __downloadLog?: (DownloadEvent & { at?: number })[] };

/* DELIVERY_SECRET in production. Otherwise a key derived from the Supabase service key, otherwise a random one for this process. */
export function deliverySecret(): string {
  if (process.env.DELIVERY_SECRET) return process.env.DELIVERY_SECRET;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY)
    return createHash('sha256')
      .update('sellonbay-delivery:' + process.env.SUPABASE_SERVICE_ROLE_KEY)
      .digest('hex');
  return (g.__deliverySecret ??= randomBytes(32).toString('hex'));
}
export const ttlSeconds = () => Math.max(1, Number(process.env.DELIVERY_TTL_SECONDS) || CONFIG.download.linkHours * 3600);

/* Sliding window limiter, kept in this server's memory. Callers use limit() in lib/rateLimit.ts, which uses Redis when it is set up and this otherwise. */
export function allow(key: string, max: number, windowMs: number, nowMs = Date.now()): boolean {
  const map = (g.__limits ??= new Map<string, number[]>());
  const hits = (map.get(key) ?? []).filter((t) => nowMs - t < windowMs);
  if (hits.length >= max) {
    map.set(key, hits);
    return false;
  }
  hits.push(nowMs);
  map.set(key, hits);
  return true;
}

export const clientIp = (req: Request) => clientAddress(req.headers);

/* One licence key per order, created the first time it is needed and never changed. */
export async function ensureLicense(orderId: string): Promise<string> {
  if (!supabaseConfigured) {
    const m = (g.__licenses ??= new Map<string, string>());
    if (!m.has(orderId)) m.set(orderId, generateLicenseKey());
    return m.get(orderId) as string;
  }
  const db = createAdminClient();
  const { data } = await db.from('licenses').select('key').eq('order_id', orderId).maybeSingle();
  if (data?.key) return data.key as string;
  for (let i = 0; i < 3; i++) {
    const key = generateLicenseKey();
    const { error } = await db.from('licenses').insert({ order_id: orderId, key });
    if (!error) return key;
    const again = await db.from('licenses').select('key').eq('order_id', orderId).maybeSingle(); // someone else got there first
    if (again.data?.key) return again.data.key as string;
  }
  throw new Error('Could not create a licence key.');
}

export type DownloadEvent = { order_id: string; kind: 'real' | 'demo' | 'trial'; user_id: string | null; ip: string; user_agent: string; file_hash: string; bytes: number };
export async function logDownload(e: DownloadEvent): Promise<void> {
  if (!supabaseConfigured) {
    (g.__downloadLog ??= []).push({ ...e, at: Date.now() });
    return;
  }
  const { error } = await createAdminClient().from('download_events').insert(e);
  if (error) console.error('download log failed', error.message);
}
/* Every file hash that was delivered for an order, once each, for the handover certificate. Downloads that stopped part way are left out. */
export async function deliveredFiles(orderId: string): Promise<{ sha256: string; bytes: number; at: number }[]> {
  type Row = { file_hash: string | null; bytes: number | null; created_at?: string };
  let rows: Row[] = memoryDownloads(orderId).map((e) => ({ file_hash: e.file_hash, bytes: e.bytes, created_at: new Date(e.at ?? Date.now()).toISOString() }));
  if (supabaseConfigured) {
    const { data } = await createAdminClient().from('download_events').select('file_hash, bytes, created_at').eq('order_id', orderId).neq('kind', 'trial').order('created_at', { ascending: true });
    rows = [...rows, ...((data ?? []) as Row[])];
  }
  const seen = new Map<string, { sha256: string; bytes: number; at: number }>();
  for (const r of rows)
    if (r.file_hash && !r.file_hash.startsWith('partial:') && !seen.has(r.file_hash))
      seen.set(r.file_hash, { sha256: r.file_hash, bytes: Number(r.bytes ?? 0), at: Date.parse(r.created_at ?? '') || Date.now() });
  return [...seen.values()];
}
/* Every download of an order, in time order, for the evidence file: who (the account), when, from which address, which file. Trial copies are left out. */
export type DownloadRow = { at: number; kind: string; userId: string | null; ip: string; sha256: string; bytes: number };
export async function downloadLog(orderId: string): Promise<DownloadRow[]> {
  const rows: DownloadRow[] = memoryDownloads(orderId)
    .filter((e) => e.kind !== 'trial')
    .map((e) => ({ at: e.at ?? 0, kind: e.kind, userId: e.user_id, ip: e.ip, sha256: e.file_hash, bytes: e.bytes }));
  if (supabaseConfigured) {
    const { data } = await createAdminClient()
      .from('download_events')
      .select('kind, user_id, ip, file_hash, bytes, created_at')
      .eq('order_id', orderId)
      .neq('kind', 'trial')
      .order('created_at', { ascending: true })
      .limit(500);
    for (const r of data ?? []) rows.push({ at: Date.parse(r.created_at), kind: r.kind, userId: r.user_id, ip: r.ip ?? '', sha256: r.file_hash ?? '', bytes: Number(r.bytes ?? 0) });
  }
  return rows.sort((a, b) => a.at - b.at);
}
export const memoryDownloads = (orderId: string) => (g.__downloadLog ?? []).filter((e) => e.order_id === orderId);

/* A small harmless file for demo orders, so the whole flow can be tried without a real seller file. */
export const dummyFile = (title: string, licenseKey: string) =>
  Buffer.from(`SellOnBay demo file\n\nProduct: ${title}\nLicence key: ${licenseKey}\n\nThis is a harmless placeholder. A real order delivers the seller's own file here.\n`, 'utf8');
