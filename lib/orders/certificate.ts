import 'server-only';
import { createHash } from 'node:crypto';
import { productByKey } from '../catalog';
import { buildCertificate } from '../certificate';
import { deliveredFiles } from '../delivery/service';
import { deliveryTypeOf, licenceOf, thirdPartyOf } from '../handover';
import { DEFAULT_LICENCE, isLicenceType } from '../licences';
import { createAdminClient } from '../supabase/server';
import type { Order, OrderEvent } from './machine';
import { orderEvents } from './service';
import { orderStore } from './store';

/*
 * One handover certificate (a PDF) per accepted order. It is made once, stored, never changed, and shown to the buyer in the order.
 * In memory without a database; with migration 0017, in the private `certificates` bucket plus a row in `certificates`.
 */
type Stored = { bytes: Uint8Array; sha256: string; issuedAt: number };
const mem: Map<string, Stored> = ((globalThis as { __certMem?: Map<string, Stored> }).__certMem ??= new Map());
const BUCKET = 'certificates';

let tableReady: { ok: boolean; at: number } | undefined;
async function inPostgres() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!tableReady || (!tableReady.ok && Date.now() - tableReady.at > 30_000)) {
    const { error } = await createAdminClient().from('certificates').select('order_id').limit(1);
    tableReady = { ok: !error, at: Date.now() };
  }
  return tableReady.ok;
}

export async function getCertificate(orderId: string): Promise<Stored | null> {
  if (await inPostgres()) {
    const db = createAdminClient();
    const { data: row } = await db.from('certificates').select('storage_path, pdf_sha256, issued_at').eq('order_id', orderId).maybeSingle();
    if (!row) return null;
    const { data: blob } = await db.storage.from(BUCKET).download(row.storage_path);
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), sha256: row.pdf_sha256, issuedAt: Date.parse(row.issued_at) };
  }
  return mem.get(orderId) ?? null;
}

async function partyNames(o: Order): Promise<{ seller: string; buyer: string }> {
  const product = await productByKey(o.productKey);
  let seller = product?.seller ?? (o.devKey ? 'Developer on SellOnBay' : 'Seller on SellOnBay');
  let buyer = o.buyerId ? `Buyer account ${o.buyerId.slice(0, 8)}` : 'Guest buyer (demo order)';
  if ((await orderStore()).kind === 'postgres') {
    const ids = [o.sellerId, o.buyerId].filter((x): x is string => !!x);
    if (ids.length) {
      const { data } = await createAdminClient().from('profiles').select('id, full_name').in('id', ids);
      const name = (id: string | null) => data?.find((p) => p.id === id)?.full_name;
      if (name(o.sellerId)) seller = name(o.sellerId);
      if (name(o.buyerId)) buyer = name(o.buyerId);
    }
  }
  return { seller, buyer };
}

/* Makes the certificate if the order is accepted and has none yet. Safe to call again. */
export async function ensureCertificate(o: Order): Promise<void> {
  if (!o.acceptedAt || (await getCertificate(o.id))) return;
  const product = await productByKey(o.productKey);
  const events = (await orderEvents(o.id)).map((e: OrderEvent) => ({ event: e.event, at: e.at }));
  const names = await partyNames(o);
  const files = await deliveredFiles(o.id);
  const dt = product ? deliveryTypeOf(product) : o.deliveryType;
  const bytes = await buildCertificate({
    orderId: o.id,
    productName: product?.name ?? o.title,
    version: '1',
    seller: names.seller,
    buyer: names.buyer,
    licence: isLicenceType(o.licence) ? o.licence : product ? licenceOf(product) : DEFAULT_LICENCE,
    thirdParty: product ? thirdPartyOf(product) : [],
    acceptedAt: o.acceptedAt,
    files,
    events,
    deliveryNote:
      dt === 'repo_access'
        ? `Delivered by invitation to the GitHub account ${o.githubUsername ?? 'named in the order'}. No files passed through the platform.`
        : dt === 'live_site'
          ? 'A live site was set up for the buyer. No files passed through the platform.'
          : 'No file download was recorded for this order.',
  });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const issuedAt = Date.now();
  if (await inPostgres()) {
    const db = createAdminClient();
    const path = `${o.id}.pdf`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (up.error && !/exists|duplicate/i.test(up.error.message)) throw new Error('Could not store the certificate: ' + up.error.message);
    const ins = await db.from('certificates').insert({ order_id: o.id, storage_path: path, pdf_sha256: sha256, file_hashes: files, issued_at: new Date(issuedAt).toISOString() });
    if (ins.error && ins.error.code !== '23505') throw new Error('Could not record the certificate: ' + ins.error.message);
  } else if (!mem.has(o.id)) mem.set(o.id, { bytes, sha256, issuedAt });
  // The history says when it was issued.
  const store = await orderStore();
  for (let i = 0; i < 3; i++) {
    const cur = await store.get(o.id);
    if (!cur) break;
    if (await store.apply(cur, cur, { orderId: o.id, actorId: null, event: 'certificate_issued', from: cur.state, to: cur.state, meta: { sha256 }, at: issuedAt })) break;
  }
}
