import 'server-only';
import { isBlocked } from '../chatFilter';
import { CONFIG, DAY_MS, feeCents } from '../config';
import { notify } from '../notify';
import { createAdminClient } from '../supabase/server';
import type { Order, OrderEvent, OrderState } from './machine';
import { getOrder } from './service';
import { orderStore } from './store';

/*
 * Extra work (a scope change inside an order). The seller sends a request (title, price, extra days); the buyer approves and pays it into
 * escrow, or declines and nothing is charged. When it is funded the order's deadline moves out by the extra days. The seller must not start
 * before it shows as funded. The payment itself comes in through the payment event handler (lib/orders/payments.ts).
 */
export type ExtraState = 'pending' | 'funded' | 'declined' | 'cancelled';
export type ChangeRequest = {
  id: string;
  orderId: string;
  sellerId: string | null;
  title: string;
  priceCents: number;
  addDays: number;
  state: ExtraState;
  feeCents: number;
  createdAt: number;
  decidedAt?: number;
  fundedAt?: number;
};

const mem: Map<string, ChangeRequest> = ((globalThis as { __extraMem?: Map<string, ChangeRequest> }).__extraMem ??= new Map());

const inPostgres = async () => (await orderStore()).kind === 'postgres';
type Row = Record<string, unknown>;
const fromRow = (r: Row): ChangeRequest => ({
  id: r.id as string,
  orderId: r.order_id as string,
  sellerId: (r.seller_id as string) ?? null,
  title: r.title as string,
  priceCents: r.price_cents as number,
  addDays: r.extra_days as number,
  state: r.status as ExtraState,
  feeCents: (r.fee_cents as number) ?? 0,
  createdAt: Date.parse(r.created_at as string),
  decidedAt: r.decided_at ? Date.parse(r.decided_at as string) : undefined,
  fundedAt: r.funded_at ? Date.parse(r.funded_at as string) : undefined,
});
const iso = (n?: number) => (n === undefined ? null : new Date(n).toISOString());

export async function listExtras(orderId: string): Promise<ChangeRequest[]> {
  if (await inPostgres()) {
    const { data } = await createAdminClient().from('change_requests').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    return (data ?? []).map(fromRow);
  }
  return [...mem.values()].filter((c) => c.orderId === orderId).sort((a, b) => a.createdAt - b.createdAt);
}
export async function getExtra(id: string): Promise<ChangeRequest | null> {
  if (await inPostgres()) {
    const { data } = await createAdminClient().from('change_requests').select('*').eq('id', id).maybeSingle();
    return data ? fromRow(data) : null;
  }
  return mem.get(id) ?? null;
}

/* pending -> next, once. False if someone else decided first. */
async function decide(c: ChangeRequest, next: ExtraState, extra: Partial<ChangeRequest> = {}): Promise<boolean> {
  const n = { ...c, ...extra, state: next, decidedAt: Date.now() };
  if (await inPostgres()) {
    const { data } = await createAdminClient()
      .from('change_requests')
      .update({ status: next, decided_at: iso(n.decidedAt), fee_cents: n.feeCents, funded_at: iso(n.fundedAt) })
      .eq('id', c.id)
      .eq('status', 'pending')
      .select('id');
    return (data?.length ?? 0) > 0;
  }
  const cur = mem.get(c.id);
  if (!cur || cur.state !== 'pending') return false;
  mem.set(c.id, n);
  return true;
}

export type ExtraResult = { ok: true; request: ChangeRequest } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): ExtraResult => ({ ok: false, status, error });

// Not while the buyer reviews a delivery: the review would end (and pay out the extra) before the extra work is done.
const OPEN_FOR_EXTRA: readonly OrderState[] = ['funded', 'in_delivery', 'overdue'];

export async function createExtra(orderId: string, sellerId: string | null, i: { title: string; priceCents: number; addDays: number }): Promise<ExtraResult> {
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (!OPEN_FOR_EXTRA.includes(o.state)) return fail(409, 'Extra work can only be added while the order is open and not yet accepted.');
  const title = i.title.trim();
  const { titleMax, minCents, maxCents, minDays, maxDays, maxPending } = CONFIG.extraWork;
  if (title.length < 3 || title.length > titleMax) return fail(400, `Give the extra work a title of 3 to ${titleMax} characters.`);
  if (isBlocked(title)) return fail(400, 'Keep emails, phone numbers and outside payment talk out of the title.');
  if (!Number.isInteger(i.priceCents) || i.priceCents < minCents || i.priceCents > maxCents) return fail(400, `The price must be $${minCents / 100} to $${maxCents / 100}.`);
  if (!Number.isInteger(i.addDays) || i.addDays < minDays || i.addDays > maxDays) return fail(400, `Extra days must be ${minDays} to ${maxDays}.`);
  const pending = (await listExtras(orderId)).filter((c) => c.state === 'pending').length;
  if (pending >= maxPending) return fail(409, `There are already ${maxPending} requests waiting for the buyer.`);

  const c: ChangeRequest = {
    id: crypto.randomUUID(),
    orderId,
    sellerId,
    title,
    priceCents: i.priceCents,
    addDays: i.addDays,
    state: 'pending',
    feeCents: feeCents(i.priceCents, 'custom'),
    createdAt: Date.now(),
  };
  if (await inPostgres()) {
    const { error } = await createAdminClient()
      .from('change_requests')
      .insert({ id: c.id, order_id: orderId, seller_id: sellerId, title, price_cents: c.priceCents, extra_days: c.addDays, status: 'pending', fee_cents: c.feeCents, created_at: iso(c.createdAt) });
    if (error) return fail(500, 'Could not save the request.');
  } else mem.set(c.id, c);
  await logOrderEvent(o, { actorId: sellerId, event: 'extra_requested', meta: { requestId: c.id, priceCents: c.priceCents, addDays: c.addDays } });
  await notify(o.buyerId, 'extra_work_request', { title: o.title, orderId: o.id, request: c.title, price: `$${(c.priceCents / 100).toFixed(2)}`, days: c.addDays });
  return { ok: true, request: c };
}

export async function declineExtra(requestId: string, buyerId: string | null): Promise<ExtraResult> {
  const c = await getExtra(requestId);
  if (!c) return fail(404, 'Request not found.');
  if (c.state !== 'pending') return fail(409, `This request is already ${c.state}.`);
  if (!(await decide(c, 'declined'))) return fail(409, 'This request has just changed.');
  const o = await getOrder(c.orderId);
  if (o) await logOrderEvent(o, { actorId: buyerId, event: 'extra_declined', meta: { requestId: c.id } });
  return { ok: true, request: { ...c, state: 'declined' } };
}

/* The seller can take a request back while it is still waiting. */
export async function cancelExtra(requestId: string, sellerId: string | null): Promise<ExtraResult> {
  const c = await getExtra(requestId);
  if (!c) return fail(404, 'Request not found.');
  if (c.state !== 'pending') return fail(409, `This request is already ${c.state}.`);
  if (!(await decide(c, 'cancelled'))) return fail(409, 'This request has just changed.');
  const o = await getOrder(c.orderId);
  if (o) await logOrderEvent(o, { actorId: sellerId, event: 'extra_cancelled', meta: { requestId: c.id } });
  return { ok: true, request: { ...c, state: 'cancelled' } };
}

/*
 * Called by the payment event handler when the buyer's payment for this request arrived. Checks the amount, marks the request funded and
 * moves the order's deadline out. The money is put into escrow in the ledger by ensureLedger (key extra:<id>).
 */
export async function fundExtra(requestId: string, amountCents: number, ref: string): Promise<ExtraResult> {
  const c = await getExtra(requestId);
  if (!c) return fail(404, 'Request not found.');
  if (c.state !== 'pending') return fail(409, `This request is already ${c.state}.`);
  if (amountCents !== c.priceCents) return fail(422, 'The payment does not match the request.');
  const store = await orderStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const o = await getOrder(c.orderId);
    if (!o || !OPEN_FOR_EXTRA.includes(o.state)) return fail(409, 'The order can no longer take extra work.');
    if (attempt === 0 && !(await decide(c, 'funded', { fundedAt: Date.now() }))) return fail(409, 'This request has just changed.');
    const next: Order = { ...o, dueAt: o.dueAt !== undefined ? o.dueAt + c.addDays * DAY_MS : o.dueAt };
    const event: OrderEvent = {
      orderId: o.id,
      actorId: o.buyerId,
      event: 'extra_funded',
      from: o.state,
      to: o.state,
      meta: { requestId: c.id, priceCents: c.priceCents, addDays: c.addDays, ref },
      at: Date.now(),
    };
    if (await store.apply(o, next, event)) {
      await notify(o.sellerId, 'extra_work_funded', { title: o.title, orderId: o.id, price: `$${(c.priceCents / 100).toFixed(2)}`, days: c.addDays });
      return { ok: true, request: { ...c, state: 'funded' } };
    }
  }
  return fail(409, 'This order has just changed. The extra work is paid; ask support to finish it.');
}

/* An event that changes nothing about the order's state but belongs in its history. */
async function logOrderEvent(o: Order, e: { actorId: string | null; event: string; meta: Record<string, unknown> }) {
  const store = await orderStore();
  const event: OrderEvent = { orderId: o.id, actorId: e.actorId, event: e.event, from: o.state, to: o.state, meta: e.meta, at: Date.now() };
  for (let i = 0; i < 3; i++) {
    const cur = (await store.get(o.id)) ?? o;
    if (await store.apply(cur, cur, { ...event, from: cur.state, to: cur.state })) return;
  }
}

/* What the browser may see of an order's extra work. */
export const extrasOf = async (orderId: string) => (await listExtras(orderId)).map((c) => ({ id: c.id, title: c.title, priceCents: c.priceCents, addDays: c.addDays, state: c.state as string }));
