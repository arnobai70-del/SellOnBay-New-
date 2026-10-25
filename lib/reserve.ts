import 'server-only';
import { audit } from './admin/audit';
import { CONFIG, DAY_MS } from './config';
import { acct, reserveReleased, sellerKey } from './ledger';
import { ledgerStore } from './ledgerStore';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * The seller reserve. When an order's payout hold ends, a share of the seller's money (CONFIG.reserve, or the seller's own override) goes to a reserve
 * account instead of available, and is let go `days` later. It covers a refund or a chargeback that comes after the payout. The default is OFF (0 percent,
 * 0 days): the numbers are the owner's decision. The overrides are set by an admin (Risk page) and audited.
 */
export type Rule = { percent: number; days: number; custom: boolean };
export type Result = { ok: true } | { ok: false; status: number; error: string };
type Row = { orderId: string; sellerId: string; cents: number; releaseAt: number; releasedAt?: number; releasedCents?: number; payoutId?: string };

const memRules: Map<string, { percent: number; days: number; note: string }> = ((globalThis as { __riskRules?: Map<string, { percent: number; days: number; note: string }> }).__riskRules ??=
  new Map());
const memReserves: Map<string, Row> = ((globalThis as { __reserves?: Map<string, Row> }).__reserves ??= new Map());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('reserves').select('order_id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

export async function reserveRule(sellerId: string | null): Promise<Rule> {
  const base: Rule = { percent: CONFIG.reserve.percent, days: CONFIG.reserve.days, custom: false };
  if (!sellerId) return base;
  if ((await pg()) && UUID.test(sellerId)) {
    const { data } = await createAdminClient().from('seller_risk').select('reserve_percent, reserve_days').eq('seller_id', sellerId).maybeSingle();
    return data ? { percent: data.reserve_percent, days: data.reserve_days, custom: true } : base;
  }
  const m = memRules.get(sellerId);
  return m ? { percent: m.percent, days: m.days, custom: true } : base;
}

export async function setSellerReserve(adminId: string | null, sellerId: string, percent: number, days: number, note: string): Promise<Result> {
  const why = note.trim();
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) return { ok: false, status: 400, error: 'The percent must be a whole number from 0 to 100.' };
  if (!Number.isInteger(days) || days < 0 || days > 180) return { ok: false, status: 400, error: 'The days must be a whole number from 0 to 180.' };
  if (why.length < 5) return { ok: false, status: 400, error: 'Write why (at least 5 characters). It goes in the audit log.' };
  if (why.length > 500) return { ok: false, status: 400, error: 'Keep the reason under 500 characters.' };
  if (await pg()) {
    if (!UUID.test(sellerId)) return { ok: false, status: 400, error: 'That is not an account id.' };
    const db = createAdminClient();
    const { data: p } = await db.from('profiles').select('id, role').eq('id', sellerId).maybeSingle();
    if (!p) return { ok: false, status: 404, error: 'Account not found.' };
    const { error } = await db.from('seller_risk').upsert({ seller_id: sellerId, reserve_percent: percent, reserve_days: days, note: why, set_by: adminId, set_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save the rule.' };
  } else memRules.set(sellerId, { percent, days, note: why });
  await audit(adminId, 'seller_reserve_set', 'profile', sellerId, { percent, days, note: why });
  return { ok: true };
}

export async function removeSellerReserve(adminId: string | null, sellerId: string, note: string): Promise<Result> {
  const why = note.trim();
  if (why.length < 5) return { ok: false, status: 400, error: 'Write why (at least 5 characters). It goes in the audit log.' };
  if (await pg()) await createAdminClient().from('seller_risk').delete().eq('seller_id', sellerId);
  else memRules.delete(sellerId);
  await audit(adminId, 'seller_reserve_removed', 'profile', sellerId, { note: why });
  return { ok: true };
}

export async function listSellerRules(): Promise<{ sellerId: string; percent: number; days: number; note: string }[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('seller_risk').select('seller_id, reserve_percent, reserve_days, note').order('set_at', { ascending: false }).limit(200);
    return (data ?? []).map((r) => ({ sellerId: r.seller_id, percent: r.reserve_percent, days: r.reserve_days, note: r.note ?? '' }));
  }
  return [...memRules].map(([sellerId, r]) => ({ sellerId, ...r }));
}

/* ---------- reserves held for orders ---------- */
export async function recordReserve(orderId: string, sellerId: string | null, cents: number, releaseAt: number): Promise<void> {
  if (cents <= 0) return;
  if (await pg())
    await createAdminClient()
      .from('reserves')
      .upsert({ order_id: orderId, seller_id: sellerKey(sellerId), cents, release_at: new Date(releaseAt).toISOString() }, { onConflict: 'order_id', ignoreDuplicates: true });
  else if (!memReserves.has(orderId)) memReserves.set(orderId, { orderId, sellerId: sellerKey(sellerId), cents, releaseAt });
}

async function due(now: number): Promise<Row[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('reserves').select('order_id, seller_id, cents, release_at').is('released_at', null).lte('release_at', new Date(now).toISOString()).limit(500);
    return (data ?? []).map((r) => ({ orderId: r.order_id, sellerId: r.seller_id, cents: r.cents, releaseAt: Date.parse(r.release_at) }));
  }
  return [...memReserves.values()].filter((r) => !r.releasedAt && r.releaseAt <= now);
}
async function markReleased(orderId: string, cents: number, now: number) {
  if (await pg())
    await createAdminClient()
      .from('reserves')
      .update({ released_at: new Date(now).toISOString(), released_cents: cents })
      .eq('order_id', orderId)
      .is('released_at', null);
  else {
    const r = memReserves.get(orderId);
    if (r) {
      r.releasedAt = now;
      r.releasedCents = cents;
    }
  }
}

/* Lets go every reserve whose time has come (less whatever a claw-back already took from it). Run by the scheduled job. Returns how many were released. */
export async function releaseDueReserves(now = Date.now()): Promise<number> {
  const L = await ledgerStore();
  let n = 0;
  for (const r of await due(now)) {
    const held = Math.max(0, await L.balance(acct.reserve(r.sellerId)));
    const amount = Math.min(r.cents, held);
    if (amount > 0) await L.post(reserveReleased({ id: r.orderId, sellerId: r.sellerId }, amount));
    await markReleased(r.orderId, amount, now);
    n++;
  }
  return n;
}

/* The reserve still held back for each of these orders (orders with none are left out). */
export async function reservesOutstanding(orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orderIds.length) return out;
  if (await pg()) {
    const { data } = await createAdminClient().from('reserves').select('order_id, cents').in('order_id', orderIds).is('released_at', null);
    for (const r of data ?? []) out.set(r.order_id, r.cents);
  } else
    for (const id of orderIds) {
      const r = memReserves.get(id);
      if (r && !r.releasedAt) out.set(id, r.cents);
    }
  return out;
}

/* Reserves that were let go and not yet paid out in a payout. Their money is available and goes into the seller's next payout. */
export async function releasedUnpaid(sellerId?: string): Promise<{ orderId: string; sellerId: string; cents: number }[]> {
  if (await pg()) {
    let q = createAdminClient().from('reserves').select('order_id, seller_id, released_cents').not('released_at', 'is', null).is('payout_id', null).gt('released_cents', 0).limit(1000);
    if (sellerId) q = q.eq('seller_id', sellerId);
    const { data } = await q;
    return (data ?? []).map((r) => ({ orderId: r.order_id, sellerId: r.seller_id, cents: r.released_cents }));
  }
  return [...memReserves.values()]
    .filter((r) => r.releasedAt !== undefined && !r.payoutId && (r.releasedCents ?? 0) > 0 && (!sellerId || r.sellerId === sellerId))
    .map((r) => ({ orderId: r.orderId, sellerId: r.sellerId, cents: r.releasedCents! }));
}

/* A payout took these released reserves, or (when it failed) gives them back for the next one. */
export async function claimReserves(orderIds: string[], payoutId: string): Promise<void> {
  if (!orderIds.length) return;
  if (await pg()) await createAdminClient().from('reserves').update({ payout_id: payoutId }).in('order_id', orderIds).is('payout_id', null);
  else for (const id of orderIds) if (memReserves.get(id) && !memReserves.get(id)!.payoutId) memReserves.get(id)!.payoutId = payoutId;
}
export async function unclaimReserves(payoutId: string): Promise<void> {
  if (await pg()) await createAdminClient().from('reserves').update({ payout_id: null }).eq('payout_id', payoutId);
  else for (const r of memReserves.values()) if (r.payoutId === payoutId) r.payoutId = undefined;
}

export const releaseAtFor = (payoutAfter: number | undefined, days: number, now = Date.now()) => (payoutAfter ?? now) + days * DAY_MS;
