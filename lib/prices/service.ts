import 'server-only';
import { audit } from '../admin/audit';
import { forgetLiveProducts } from '../catalog';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import { dueSaleSteps, priceShown, saleProblem, type HistoryRow, type PriceShown, type Sale, type SaleInput } from './rules';

/*
 * Launch prices and sales (owner, 2026-11-08; migration 0084). The price history is kept by a database trigger on products.price_cents; a sale
 * sets the listing's price for its days and puts the regular price back at the end (runSaleJobs, from the scheduled job), so the history and the
 * money always follow the price really charged. Without the database or before 0084 there are no sales and prices show as they are.
 */
type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const t = (s: string | null) => (s ? Date.parse(s) : null);
type SaleRow = {
  id: string;
  product_id: string;
  kind: Sale['kind'];
  regular_cents: number;
  sale_cents: number;
  starts_at: string;
  ends_at: string;
  started_at: string | null;
  ended_at: string | null;
  cancelled_at: string | null;
};
const toSale = (r: SaleRow): Sale & { productId: string } => ({
  id: r.id,
  productId: r.product_id,
  kind: r.kind,
  regularCents: r.regular_cents,
  saleCents: r.sale_cents,
  startsAt: Date.parse(r.starts_at),
  endsAt: Date.parse(r.ends_at),
  startedAt: t(r.started_at),
  endedAt: t(r.ended_at),
  cancelledAt: t(r.cancelled_at),
});

let ready: { ok: boolean; at: number } | undefined;
export async function pricesReady(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 60_000)) ready = { ok: !(await createAdminClient().from('listing_sales').select('id').limit(1)).error, at: Date.now() };
  return ready.ok;
}

export async function historyOf(productIds: string[]): Promise<Map<string, HistoryRow[]>> {
  const out = new Map<string, HistoryRow[]>();
  if (!productIds.length || !(await pricesReady())) return out;
  const { data } = await createAdminClient()
    .from('listing_price_history')
    .select('product_id, price_cents, valid_from, valid_to, from_creation')
    .in('product_id', productIds)
    .order('valid_from')
    .limit(5000);
  for (const r of data ?? [])
    out.set(r.product_id, [...(out.get(r.product_id) ?? []), { priceCents: r.price_cents, from: Date.parse(r.valid_from), to: t(r.valid_to), fromCreation: !!r.from_creation }]);
  return out;
}

export async function salesOf(productIds: string[]): Promise<Map<string, (Sale & { productId: string })[]>> {
  const out = new Map<string, (Sale & { productId: string })[]>();
  if (!productIds.length || !(await pricesReady())) return out;
  const { data } = await createAdminClient().from('listing_sales').select('*').in('product_id', productIds).order('starts_at', { ascending: false }).limit(5000);
  for (const r of (data ?? []) as SaleRow[]) out.set(r.product_id, [...(out.get(r.product_id) ?? []), toSale(r)]);
  return out;
}

/* What each listing shows now (sale badge, "was" price, launch note), for cards, pages, the cart and the dashboards. Keyed by database id. */
export async function priceDisplays(items: { dbId?: string; price: number }[], now = Date.now()): Promise<Map<string, PriceShown>> {
  const ids = items.map((p) => p.dbId).filter((x): x is string => !!x);
  const out = new Map<string, PriceShown>();
  if (!ids.length || !(await pricesReady())) return out;
  const sales = await salesOf(ids);
  const onSale = ids.filter((id) => (sales.get(id) ?? []).some((s) => s.startedAt && !s.endedAt && !s.cancelledAt));
  const history = await historyOf(onSale);
  for (const p of items) if (p.dbId && onSale.includes(p.dbId)) out.set(p.dbId, priceShown(Math.round(p.price * 100), history.get(p.dbId) ?? [], sales.get(p.dbId) ?? [], now));
  return out;
}

/* A seller (their own listing) or an admin plans a launch price or a sale. Audited. It starts by itself at its time (runSaleJobs). */
export async function createSale(actorId: string | null, productId: string, input: SaleInput, opts: { sellerId?: string } = {}, now = Date.now()): Promise<R<Sale>> {
  if (!(await pricesReady())) return fail(503, 'Sales need the database.');
  const db = createAdminClient();
  const { data: p } = await db.from('products').select('id, seller_id, price_cents, status').eq('id', productId).maybeSingle();
  if (!p || (opts.sellerId && p.seller_id !== opts.sellerId)) return fail(404, 'Listing not found.');
  const [sales, history] = await Promise.all([salesOf([productId]), historyOf([productId])]);
  const problem = saleProblem(input, { now, priceCents: p.price_cents, sales: sales.get(productId) ?? [], history: history.get(productId) ?? [] });
  if (problem) return fail(400, problem);
  const { data, error } = await db
    .from('listing_sales')
    .insert({
      product_id: productId,
      kind: input.kind,
      regular_cents: p.price_cents,
      sale_cents: input.saleCents,
      starts_at: new Date(input.startsAt).toISOString(),
      ends_at: new Date(input.endsAt).toISOString(),
      created_by: actorId && /^[0-9a-f-]{36}$/i.test(actorId) ? actorId : null,
    })
    .select('*')
    .single();
  if (error || !data) return fail(500, 'Could not save the sale.');
  await audit(actorId, `listing_${input.kind}_planned`, 'product', productId, { sale: input.saleCents, regular: p.price_cents, startsAt: input.startsAt, endsAt: input.endsAt });
  await runSaleJobs(now); // a sale starting now starts at once
  return { ok: true, value: toSale(data as SaleRow) };
}

/* Stops a planned or running sale; a running one puts the regular price back at once. Audited. */
export async function cancelSale(actorId: string | null, saleId: string, opts: { sellerId?: string } = {}): Promise<R<true>> {
  if (!(await pricesReady())) return fail(503, 'Sales need the database.');
  const db = createAdminClient();
  const { data: r } = await db.from('listing_sales').select('*, products!inner(seller_id)').eq('id', saleId).maybeSingle();
  if (!r || (opts.sellerId && (r as { products: { seller_id: string } }).products.seller_id !== opts.sellerId)) return fail(404, 'Sale not found.');
  const s = toSale(r as SaleRow);
  if (s.endedAt || s.cancelledAt) return fail(409, 'This sale is already over.');
  const at = new Date().toISOString();
  if (s.startedAt) await db.from('products').update({ price_cents: s.regularCents }).eq('id', s.productId);
  await db
    .from('listing_sales')
    .update({ cancelled_at: at, ...(s.startedAt ? { ended_at: at } : {}) })
    .eq('id', s.id);
  forgetLiveProducts();
  await audit(actorId, 'listing_sale_cancelled', 'product', s.productId, { sale: s.id });
  return { ok: true, value: true };
}

/* The scheduled job: start sales whose time has come and end the ones that are over (the trigger records each price in the history). */
export async function runSaleJobs(now = Date.now()): Promise<{ started: number; ended: number }> {
  if (!(await pricesReady())) return { started: 0, ended: 0 };
  const db = createAdminClient();
  const { data } = await db.from('listing_sales').select('*').is('ended_at', null).is('cancelled_at', null).limit(1000);
  const { start, end } = dueSaleSteps(((data ?? []) as SaleRow[]).map(toSale), now);
  const at = new Date(now).toISOString();
  for (const s of start) {
    const x = s as Sale & { productId: string };
    await db.from('products').update({ price_cents: x.saleCents }).eq('id', x.productId);
    await db.from('listing_sales').update({ started_at: at }).eq('id', x.id).is('started_at', null);
  }
  for (const s of end) {
    const x = s as Sale & { productId: string };
    if (x.startedAt) await db.from('products').update({ price_cents: x.regularCents }).eq('id', x.productId); // back to the regular price
    await db.from('listing_sales').update({ ended_at: at }).eq('id', x.id).is('ended_at', null);
  }
  if (start.length || end.length) forgetLiveProducts();
  return { started: start.length, ended: end.length };
}

/* The listing's current price when a sale is planned or running (its price may not be edited then), else null. */
export async function priceLockedBySale(productId: string): Promise<number | null> {
  if (!(await pricesReady())) return null;
  const db = createAdminClient();
  const { data } = await db.from('listing_sales').select('id').eq('product_id', productId).is('ended_at', null).is('cancelled_at', null).limit(1);
  if (!data?.length) return null;
  const { data: p } = await db.from('products').select('price_cents').eq('id', productId).maybeSingle();
  return p?.price_cents ?? null;
}
export const SALE_LOCK_TEXT = 'This listing has a sale planned or running. Change the price after it ends, or stop the sale first.';

/* The open sale (planned or running) of each listing, by slug, for the seller's and the admin's lists. */
export async function openSalesBySlug(rows: { id: string; slug: string }[], now = Date.now()) {
  const sales = await salesOf(rows.map((r) => r.id));
  const out = new Map<string, { id: string; kind: Sale['kind']; saleCents: number; startsAt: number; endsAt: number; running: boolean }>();
  for (const r of rows) {
    const s = (sales.get(r.id) ?? []).find((x) => !x.endedAt && !x.cancelledAt);
    if (s) out.set(r.slug, { id: s.id, kind: s.kind, saleCents: s.saleCents, startsAt: s.startsAt, endsAt: s.endsAt, running: !!s.startedAt && s.startsAt <= now && now < s.endsAt });
  }
  return out;
}
