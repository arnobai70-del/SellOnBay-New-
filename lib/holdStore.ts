import 'server-only';
import { CONFIG } from './config';
import { isNewAccount } from './guard';
import { notifyAdmins } from './notify';
import { getSettings } from './settings';
import type { Order } from './orders/machine';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * A suspicious paid order waits for an admin before the seller starts and before any file is released. Suspicious means a real (not demo) order from
 * a flagged buyer, or from an account younger than CONFIG.limits.newAccountDays paying CONFIG.risk.holdNewBuyerMinCents or more. The money stays in
 * escrow either way, and the delivery timer stands still while the order is held. This file has the rules and the storage; the admin's decision
 * (release or cancel) is in lib/holds.ts. Never blocks an order by itself.
 */
export type Hold = { orderId: string; reason: string; createdAt: number; title: string; priceCents: number };

type MemHold = Hold & { decided?: 'released' | 'cancelled' };
const mem: Map<string, MemHold> = ((globalThis as { __holdMem?: Map<string, MemHold> }).__holdMem ??= new Map());

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('order_holds').select('order_id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

async function buyerFlagged(buyerId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(buyerId) || (await orderStore()).kind !== 'postgres') return false;
  const { data } = await createAdminClient().from('profiles').select('flagged').eq('id', buyerId).maybeSingle();
  return !!data?.flagged;
}

/* Why this paid order should be checked first, or null. */
export async function holdReasonFor(o: Order, now = Date.now()): Promise<string | null> {
  if (o.demo || !o.buyerId || !o.sellerId) return null;
  if (await buyerFlagged(o.buyerId)) return 'The buyer account is flagged.';
  const min = (await getSettings()).holdNewBuyerMinCents;
  if (min > 0 && o.priceCents >= min && (await isNewAccount(o.buyerId, now))) return `A new account (under ${CONFIG.limits.newAccountDays} days) paid ${(o.priceCents / 100).toFixed(2)} USD.`;
  return null;
}

/* Called right after an order is funded, before anybody is told. Returns true if the order is now on hold. */
export async function maybeHold(o: Order, now = Date.now()): Promise<boolean> {
  const reason = await holdReasonFor(o, now);
  if (!reason) return false;
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('order_holds')
      .insert({ order_id: o.id, reason, created_at: new Date(now).toISOString() });
    if (error) return error.code === '23505'; // already held
  } else if (!mem.has(o.id)) mem.set(o.id, { orderId: o.id, reason, createdAt: now, title: o.title, priceCents: o.priceCents });
  await notifyAdmins('order_hold_alert', { title: o.title, orderId: o.id, reason, price: (o.priceCents / 100).toFixed(2) }, `hold:${o.id}`);
  return true;
}

/* Why the seller cannot start and no file can be released yet, or null when nothing is holding the order. */
export async function heldReason(orderId: string): Promise<string | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('order_holds').select('reason').eq('order_id', orderId).is('decided_at', null).maybeSingle();
    return data ? data.reason : null;
  }
  const h = mem.get(orderId);
  return h && !h.decided ? h.reason : null;
}
export const HELD_TEXT = 'This order is waiting for a short safety check by our team. The money is safe in escrow and the work starts as soon as it is cleared.';

/* When the hold began (the delivery timer stands still from then), or null when the order is not held. */
export async function heldSince(orderId: string): Promise<number | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('order_holds').select('created_at').eq('order_id', orderId).is('decided_at', null).maybeSingle();
    return data ? Date.parse(data.created_at) : null;
  }
  const h = mem.get(orderId);
  return h && !h.decided ? h.createdAt : null;
}

export async function listHolds(): Promise<Hold[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('order_holds').select('order_id, reason, created_at, orders(title, price_cents)').is('decided_at', null).order('created_at').limit(100);
    return (data ?? []).map((r) => {
      const o = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as { title?: string; price_cents?: number } | null;
      return { orderId: r.order_id, reason: r.reason, createdAt: Date.parse(r.created_at), title: o?.title ?? '', priceCents: o?.price_cents ?? 0 };
    });
  }
  return [...mem.values()].filter((h) => !h.decided).map(({ decided: _d, ...h }) => h);
}

/* Marks the hold decided. False if it was decided a moment ago by somebody else. */
export async function markDecided(orderId: string, outcome: 'released' | 'cancelled', adminId: string | null, note: string): Promise<boolean> {
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('order_holds')
      .update({ decided_at: new Date().toISOString(), decided_by: adminId, outcome, note })
      .eq('order_id', orderId)
      .is('decided_at', null)
      .select('order_id');
    return !!data?.length;
  }
  const h = mem.get(orderId);
  if (!h || h.decided) return false;
  h.decided = outcome;
  return true;
}
