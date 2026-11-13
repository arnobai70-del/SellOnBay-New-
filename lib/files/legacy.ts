import 'server-only';
import { tx } from '../i18n/tx';
import { auditStrict } from '../admin/audit';
import { CONFIG } from '../config';
import { safeFetch } from '../delivery/ssrf';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { objectStore, type ObjectStore } from './objectStore';
import { runChecks, type Result } from './service';
import { insertFile, listFiles, updateFile, versionsOf, type FileObject } from './store';

/*
 * Legacy listings (owner decision F-15): products from before SellOnBay 2.0 point at a file on the seller's own host (products.code_url).
 * Before such a product can be sold again, an admin imports that file ONCE into quarantine. It then passes every automatic check, and the
 * reviewer sees evidence: whether its SHA-256 matches what earlier buyers downloaded (download_events). A mismatch needs evidence review
 * and the review before approval (there is no malware scan). Earlier buyers keep their access until their own order is reviewed; nothing is replaced silently.
 */
export type LegacyCandidate = { productId: string; slug: string; name: string; sellerId: string; host: string; priorHashes: string[]; downloads: number; openImport: string | null };

/* Who still needs an import. Read-only: a dry run that changes nothing. */
export async function legacyCandidates(): Promise<LegacyCandidate[]> {
  if ((await orderStore()).kind !== 'postgres') return [];
  const db = createAdminClient();
  const { data: products } = await db.from('products').select('id, slug, name, seller_id, code_url').like('code_url', 'https://%').neq('status', 'draft').limit(500);
  const out: LegacyCandidate[] = [];
  for (const p of products ?? []) {
    if ((await versionsOf(p.id)).length) continue;
    const open = (await listFiles({ productId: p.id, states: ['checking', 'awaiting_review'] })).find((f) => f.purpose === 'legacy');
    const { data: orders } = await db.from('orders').select('id').eq('product_id', p.id).limit(1000);
    const ids = (orders ?? []).map((o) => o.id);
    const { data: dl } = ids.length ? await db.from('download_events').select('file_hash').in('order_id', ids).eq('kind', 'real') : { data: [] as { file_hash: string | null }[] };
    const hashes = [...new Set((dl ?? []).map((d) => d.file_hash).filter((h): h is string => !!h && /^[0-9a-f]{64}$/.test(h)))];
    let host = '';
    try {
      host = new URL(p.code_url).host;
    } catch {
      host = '(bad link)';
    }
    out.push({ productId: p.id, slug: p.slug, name: p.name, sellerId: p.seller_id, host, priorHashes: hashes, downloads: (dl ?? []).length, openImport: open?.id ?? null });
  }
  return out;
}

/* Pure: what the evidence says about an imported file. */
export function legacyEvidence(sha256: string, priorHashes: string[]): { priorHashes: number; matchesEarlierDownloads: boolean | null; needsEvidenceReview: boolean } {
  if (!priorHashes.length) return { priorHashes: 0, matchesEarlierDownloads: null, needsEvidenceReview: false };
  const match = priorHashes.includes(sha256) && priorHashes.length === 1;
  return { priorHashes: priorHashes.length, matchesEarlierDownloads: priorHashes.includes(sha256), needsEvidenceReview: !match };
}

/* Fetches the seller-hosted file once (SSRF-guarded, size-capped) into quarantine and starts the checks. Catalog admin; audited first. */
export async function importLegacy(adminId: string | null, productId: string, store: ObjectStore = objectStore()): Promise<Result<FileObject>> {
  const c = (await legacyCandidates()).find((x) => x.productId === productId);
  if (!c) return { ok: false, status: 404, error: tx('This listing has no legacy file to import (or it already has an approved version).') };
  if (c.openImport) return { ok: false, status: 409, error: tx('An import of this listing is already being checked.') };
  const { data: p } = await createAdminClient().from('products').select('code_url').eq('id', productId).single();
  await auditStrict(adminId, 'legacy_file_import', 'product', productId, { host: c.host, priorHashes: c.priorHashes.length });
  const max = CONFIG.files.maxArchiveMb * 1024 * 1024;
  let bytes: Uint8Array;
  try {
    const res = await safeFetch(p!.code_url, AbortSignal.timeout(120_000));
    if (!res.ok) return { ok: false, status: 502, error: `The seller's link answered ${res.status}.` };
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > max) return { ok: false, status: 413, error: `The file is larger than ${CONFIG.files.maxArchiveMb} MB.` };
    // Read with a hard cap: a host that sends no length (or lies) cannot make the server hold more than the limit.
    if (!res.body) return { ok: false, status: 502, error: "The seller's link sent no file." };
    const parts: Uint8Array[] = [];
    let total = 0;
    const rd = res.body.getReader();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await rd.cancel();
        return { ok: false, status: 413, error: `The file is larger than ${CONFIG.files.maxArchiveMb} MB.` };
      }
      parts.push(value);
    }
    bytes = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.byteLength;
    }
  } catch {
    return { ok: false, status: 502, error: "The seller's link could not be fetched safely." };
  }
  const id = crypto.randomUUID();
  const path = `${id}/legacy.zip`;
  const rec = await insertFile(
    {
      id,
      purpose: 'legacy',
      productId,
      orderId: null,
      uploadedBy: c.sellerId,
      originalName: 'legacy.zip',
      declaredSize: Math.max(1, bytes.byteLength),
      sizeBytes: null,
      sha256: null,
      quarantinePath: path,
      approvedPath: null,
      state: 'awaiting_upload',
      checks: {},
      scanProvider: null,
      scanVerdict: null,
      scanReference: null,
      scanDetail: null,
      reviewedBy: null,
      reviewNote: null,
      purgeAfter: null,
      legalHold: false,
    },
    { actorId: adminId, event: 'legacy_import', from: null, to: 'awaiting_upload', detail: { host: c.host } },
  );
  await store.putQuarantine(path, bytes);
  const { createHash } = await import('node:crypto');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const checking = await updateFile(
    rec,
    { state: 'checking', sizeBytes: bytes.byteLength, checks: { evidence: legacyEvidence(sha, c.priorHashes) } },
    { actorId: adminId, event: 'legacy_fetched', detail: { size: bytes.byteLength } },
  );
  const r = await runChecks(checking.id, { store });
  return r.ok ? r : { ok: true, value: checking };
}
