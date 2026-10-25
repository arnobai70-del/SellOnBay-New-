import 'server-only';
import {
  IllegalTransition,
  dueSteps,
  isFundedState,
  orderFee,
  transition,
  type DeliveryType,
  type Line,
  type Order,
  type OrderEvent,
  type OrderKind,
  type OrderPackage,
  type OrderState,
} from './machine';
import {
  acct,
  buyerPays,
  debtSettled,
  extraAccepted,
  extraWorkFunded,
  fullRefundAfterAccept,
  holdMoved,
  orderAccepted,
  partialRefundAfterAccept,
  refund,
  reserveShare,
  sellerFee,
  sellerKey,
  split,
  type SellerHolds,
} from '../ledger';
import { ledgerStore, type LedgerStore } from '../ledgerStore';
import { notifyOrderEvent, notifyReminders } from './notifications';
import { isOrderId, orderStore } from './store';
import { heldReason, maybeHold } from '../holdStore';
import { bump } from '../metrics';
import { CONFIG, DAY_MS } from '../config';
import { sharedLock } from '../rateLimit';
import { inviteState, noteInvite, requestRevocation } from '../repoAccess';
import { recordReserve, releaseAtFor, reserveRule } from '../reserve';

/* What the rest of the app calls. Everything goes through the state machine and the store; nothing edits an order directly. */

export type NewOrder = {
  kind: OrderKind;
  pkg: OrderPackage;
  deliveryType: DeliveryType;
  title: string;
  lines: Line[];
  days: number;
  buyerId: string | null;
  sellerId?: string | null;
  productKey?: string;
  productId?: string; // the listing's row id (a seller's own listing)
  devKey?: string;
  brief?: string;
  domain?: Order['domain'];
  appName?: string;
  oses?: string[];
  githubUsername?: string;
  licence?: string;
  supportDays?: number;
  updateDays?: number;
  trialCreditFor?: string;
  instant?: boolean;
  express?: boolean;
  demo?: boolean;
};

/*
 * Makes the ledger (and, once accepted, the handover certificate) match the order's state. Every entry has a fixed key, so running this again (after every change, and in the scheduled job)
 * posts only what is missing. If a post fails the order is not rolled back; the next run tries again and the failure is logged.
 */
/* What the seller holds right now, for taking money back from them (lib/ledger.ts takeFromSeller). */
async function holdsOf(L: LedgerStore, sellerId: string | null): Promise<SellerHolds> {
  const k = sellerKey(sellerId);
  return { pending: await L.balance(acct.pending(k)), reserve: await L.balance(acct.reserve(k)), available: await L.balance(acct.available(k)) };
}

/* A fee the seller is responsible for (a dispute fee), taken from the seller and paid to the platform; once per key. Returns how much was charged. */
export async function chargeSellerFee(o: Order, key: string, memo: string, feeCents: number): Promise<number> {
  if (feeCents <= 0) return 0;
  const L = await ledgerStore();
  await L.post(sellerFee(o, key, memo, feeCents, await holdsOf(L, o.sellerId)));
  return feeCents;
}

export async function ensureLedger(o: Order): Promise<void> {
  if (!o.fundedAt) return;
  const L = await ledgerStore();
  const money = { id: o.id, sellerId: o.sellerId, lines: o.lines, feeCents: o.feeCents };
  try {
    await L.post(buyerPays(money));
    const { listExtras } = await import('./extra');
    const extras = (await listExtras(o.id)).filter((c) => c.state === 'funded');
    for (const c of extras) await L.post(extraWorkFunded(o, c.id, c.priceCents));
    if (o.acceptedAt) {
      await L.post(orderAccepted(money));
      for (const c of extras) await L.post(extraAccepted(o, c.id, c.priceCents, c.feeCents));
      // New earnings first pay off what the seller owes from an earlier claw-back.
      const owed = await L.balance(acct.debt(sellerKey(o.sellerId)));
      if (owed > 0) {
        const earned = split(o.lines, o.feeCents).sellerNet + extras.reduce((s, c) => s + c.priceCents - c.feeCents, 0);
        const settle = Math.min(owed, earned, await L.balance(acct.pending(sellerKey(o.sellerId))));
        if (settle > 0) await L.post(debtSettled(o, settle));
      }
      // After a dispute the release is reversed, in full or in part. It comes out of pending, then the reserve, then available, then becomes debt.
      // A partial refund is posted once; a full refund decided later on the same order gives back only the rest.
      if (o.refundedCents > 0) await L.post(partialRefundAfterAccept(money, o.refundedCents, await holdsOf(L, o.sellerId)));
      if (o.state === 'refunded') await L.post(fullRefundAfterAccept(money, extras, await holdsOf(L, o.sellerId), o.refundedCents));
    }
    if (o.state === 'payout_pending' || o.state === 'paid_out') {
      const extraNet = extras.reduce((s, c) => s + c.priceCents - c.feeCents, 0);
      const key = sellerKey(o.sellerId);
      const rule = await reserveRule(o.sellerId);
      // Earnings that already paid off an old debt when the order was accepted never reached pending for this order: they must not be taken
      // from another order's pending (still in its hold and open to a dispute).
      const settled = (await L.lines(`debt-settle:${o.id}`))[0]?.amountCents ?? 0;
      const planned = split(o.lines, o.feeCents).sellerNet + extraNet - o.refundedCents - settled;
      const pending = await L.balance(acct.pending(key));
      const moving = Math.min(planned, pending);
      const reserveCents = rule.days > 0 ? reserveShare(moving, rule.percent) : 0;
      const entry = holdMoved(money, extraNet - o.refundedCents - settled, { pendingCents: pending, reserveCents });
      if (entry) {
        // Written down before the money moves: a reserve record without money is harmless (nothing to release), money without a record would be stuck.
        if (reserveCents > 0) await recordReserve(o.id, o.sellerId, reserveCents, releaseAtFor(o.payoutAfter, rule.days));
        await L.post(entry);
      }
    }
    if ((o.state === 'refunded' || o.state === 'cancelled') && !o.acceptedAt) {
      const inEscrow = await L.balance(acct.escrow(o.id)); // the order and any extra work that was funded
      if (inEscrow > 0) await L.post(refund({ id: o.id }, inEscrow));
    }
  } catch (e) {
    console.error('ledger: could not post for order', o.id, e);
  }
  // The handover certificate is the other record made when an order is accepted.
  if (o.acceptedAt) {
    try {
      await (await import('./certificate')).ensureCertificate(o);
    } catch (e) {
      console.error('certificate: could not make it for order', o.id, e);
    }
  }
}

/*
 * After a cancel or a full refund: asks the payment provider to give back what it still holds for this order, the price plus funded extra work,
 * less anything refunded already. The ledger side is ensureLedger's. Returns the amount asked for (0 when nothing is left).
 */
export async function refundAtProvider(o: Order): Promise<number> {
  const { listExtras } = await import('./extra');
  const extras = (await listExtras(o.id)).filter((c) => c.state === 'funded').reduce((s, c) => s + c.priceCents, 0);
  const amount = o.priceCents + extras - o.refundedCents;
  if (amount <= 0) return 0;
  const { paymentProvider } = await import('../providers/payment');
  await paymentProvider().refund(o.id, amount);
  return amount;
}

/* What a buyer chose, as one string: two orders with the same choice and price are the same purchase. */
type Choice = Pick<NewOrder, 'kind' | 'pkg' | 'lines' | 'domain' | 'appName' | 'oses' | 'express' | 'instant' | 'githubUsername' | 'brief' | 'trialCreditFor'> & {
  productKey?: string | null;
  devKey?: string | null;
};
const choiceOf = (o: Choice) =>
  JSON.stringify([
    o.kind,
    o.pkg,
    o.productKey ?? null,
    o.devKey ?? null,
    o.lines,
    o.domain ?? null,
    o.appName ?? null,
    o.oses ?? null,
    !!o.express,
    !!o.instant,
    o.githubUsername ?? null,
    o.brief ?? null,
    o.trialCreditFor ?? null,
  ]);

/* One Buy at a time per buyer on this server, so a double click cannot slip two orders past the check below. */
const buying = ((globalThis as { __buying?: Map<string, Promise<unknown>> }).__buying ??= new Map());
async function oneAtATime<T>(key: string, run: () => Promise<T>): Promise<T> {
  const before = buying.get(key) ?? Promise.resolve();
  const mine = before.then(run, run);
  const settled = mine.catch(() => undefined);
  buying.set(key, settled);
  try {
    return await mine;
  } finally {
    if (buying.get(key) === settled) buying.delete(key);
  }
}

/*
 * A signed-in buyer who presses Buy again for the same thing (a double click, a reload, a second tab) within CONFIG.orderReuseMinutes gets the
 * order already waiting for payment, so they cannot end up paying twice. Signed-out demo orders have no buyer to match on and are always new.
 */
export async function createOrder(i: NewOrder, now = Date.now()): Promise<Order> {
  if (!i.buyerId) return insertOrder(i, now);
  const buyerId = i.buyerId;
  return oneAtATime(buyerId, async () => {
    // The same, across copies of the site when Redis is set (lib/rateLimit.ts).
    const release = await sharedLock(`buy:${buyerId}`);
    try {
      const want = choiceOf(i);
      const recent = await (await orderStore()).unpaidSince(buyerId, now - CONFIG.orderReuseMinutes * 60_000);
      const same = recent.find((o) => o.sellerId === (i.sellerId ?? null) && choiceOf(o) === want);
      return same ?? (await insertOrder(i, now));
    } finally {
      await release();
    }
  });
}

async function insertOrder(i: NewOrder, now: number): Promise<Order> {
  const total = i.lines.reduce((s, l) => s + l[1], 0);
  const o: Order = {
    id: crypto.randomUUID(),
    kind: i.kind,
    pkg: i.pkg,
    deliveryType: i.deliveryType,
    state: 'awaiting_payment',
    title: i.title,
    buyerId: i.buyerId,
    sellerId: i.sellerId ?? null,
    productId: i.productId ?? null,
    productKey: i.productKey ?? null,
    devKey: i.devKey ?? null,
    brief: i.brief,
    lines: i.lines,
    priceCents: total,
    feeCents: orderFee(i.lines, i.kind),
    refundedCents: 0,
    currency: 'USD',
    days: i.days,
    express: !!i.express,
    instant: !!i.instant,
    demo: i.demo ?? true,
    domain: i.domain,
    appName: i.appName,
    oses: i.oses,
    githubUsername: i.githubUsername,
    licence: i.licence,
    supportDays: i.supportDays,
    updateDays: i.updateDays,
    trialCreditFor: i.trialCreditFor,
    attempts: 0,
    createdAt: now,
  };
  const created: OrderEvent = { orderId: o.id, actorId: i.buyerId, event: 'created', from: null, to: 'awaiting_payment', meta: { total: total }, at: now };
  await (await orderStore()).insert(o, created);
  await bump('orders', 1, now);
  return o;
}

/* Applies the steps that became due because time passed (demo seller, auto-accept, overdue, end of the hold). Safe to call on every read. */
export async function tick(o: Order, now = Date.now()): Promise<Order> {
  if (isFundedState(o.state) && (await heldReason(o.id))) return o; // waiting for a safety check: no timer runs (lib/holds.ts)
  const store = await orderStore();
  let cur = o;
  for (const s of dueSteps(o, now)) {
    if (!(await store.apply(cur, s.order, s.event))) return (await store.get(o.id)) ?? cur; // someone else moved it first
    cur = s.order;
    await notifyOrderEvent(cur, s.event);
  }
  if (cur !== o) await ensureLedger(cur);
  return cur;
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!isOrderId(id)) return null;
  const o = await (await orderStore()).get(id);
  return o ? tick(o) : null;
}

export async function orderEvents(id: string): Promise<OrderEvent[]> {
  return (await orderStore()).events(id);
}

export type Result = { ok: true; order: Order } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

/* One change of state, by one person, with a log entry. Never throws for a normal "not allowed". */
export async function move(
  id: string,
  to: OrderState,
  opts: { actorId?: string | null; event?: string; meta?: Record<string, unknown>; patch?: (o: Order) => Order; now?: number; beforeNotify?: (o: Order) => Promise<void> },
): Promise<Result> {
  const cur = await getOrder(id);
  if (!cur) return fail(404, 'Order not found.');
  try {
    const t = transition(opts.patch ? opts.patch(cur) : cur, to, { now: opts.now ?? Date.now(), actorId: opts.actorId ?? null, event: opts.event, meta: opts.meta });
    // The patch (for example payment details) is part of the same step: compare against the order as it was read.
    if (!(await (await orderStore()).apply(cur, t.order, t.event))) return fail(409, 'This order has just changed. Reload and try again.');
    await ensureLedger(t.order);
    if (opts.beforeNotify) await opts.beforeNotify(t.order);
    await notifyOrderEvent(t.order, t.event);
    if (to === 'refunded') await bump('refunds');
    await requestRevocation(t.order); // a repository order refunded or cancelled after its invite: tell the seller to remove the buyer
    return { ok: true, order: await tick(t.order) };
  } catch (e) {
    if (e instanceof IllegalTransition) return fail(409, `This order cannot do that now (it is ${cur.state.replace('_', ' ')}).`);
    throw e;
  }
}

/* Counts a payment try without changing state, so the limit cannot be got around. */
export async function countAttempt(o: Order): Promise<Order> {
  const next = { ...o, attempts: o.attempts + 1 };
  await (await orderStore()).patch(o, next);
  return next;
}

export const fund = (id: string, payment: NonNullable<Order['payment']>, domain: Order['domain'] | undefined, actorId: string | null) =>
  move(id, 'funded', {
    actorId,
    event: 'funded',
    meta: { provider: 'fake', ref: payment.ref },
    patch: (o) => ({ ...o, payment, domain: domain ?? o.domain }),
    beforeNotify: async (o) => void (await maybeHold(o)),
  });

/* Repo handover: the seller says the GitHub invite was sent; the buyer says they can open it; only then does the review window start. */
export async function handoverSent(id: string, sellerId: string | null): Promise<Result> {
  const cur = await getOrder(id);
  if (!cur) return fail(404, 'Order not found.');
  if (cur.deliveryType !== 'repo_access') return fail(409, 'This order is not delivered through a repository.');
  if (cur.state !== 'funded') return fail(409, cur.state === 'in_delivery' ? 'The invite was already sent.' : `This order cannot do that now (it is ${cur.state.replace('_', ' ')}).`);
  const r = await move(id, 'in_delivery', { actorId: sellerId, event: 'repo_invited', meta: { github: cur.githubUsername ?? null } });
  if (r.ok) await noteInvite(id);
  return r;
}
export async function confirmAccess(id: string, buyerId: string | null): Promise<Result> {
  const cur = await getOrder(id);
  if (!cur) return fail(404, 'Order not found.');
  if (cur.deliveryType !== 'repo_access') return fail(409, 'This order is not delivered through a repository.');
  const invited = (await orderEvents(id)).some((e) => e.event === 'repo_invited');
  if (cur.state !== 'in_delivery' || !invited) return fail(409, 'The seller has not sent your invite yet.');
  return move(id, 'delivered', { actorId: buyerId, event: 'access_confirmed', meta: { github: cur.githubUsername ?? null } });
}

export const accept = (id: string, actorId: string | null) => move(id, 'accepted', { actorId, event: 'accepted' });
export const deliver = (id: string, actorId: string | null, note?: string) => move(id, 'delivered', { actorId, event: 'delivered', meta: note ? { note: note.slice(0, 200) } : {} });
export const cancel = (id: string, actorId: string | null, reason: string) => move(id, 'cancelled', { actorId, event: 'cancelled', meta: { reason } });

/* Demo control: jump to delivery, or skip the review window. Only for orders paid through the fake provider. */
export async function demoSkip(id: string): Promise<Result> {
  const cur = await getOrder(id);
  if (!cur) return fail(404, 'Order not found.');
  if (!cur.demo || cur.sellerId) return fail(403, 'Not available.');
  if (cur.state === 'delivered') {
    // Pull the end of the review window to now; the normal auto-accept does the rest.
    const next = { ...cur, reviewEndsAt: Date.now() - 1 };
    const store = await orderStore();
    if (!(await store.patch(cur, next))) return fail(409, 'This order has just changed.');
    return { ok: true, order: await tick(next) };
  }
  if (cur.state === 'funded' || cur.state === 'in_delivery') return move(id, 'delivered', { actorId: null, event: 'demo_skip', meta: { by: 'demo control' } });
  return fail(409, 'Nothing to skip.');
}

/*
 * A repository order whose buyer never says "I can open it": access counts as confirmed CONFIG.repo.autoConfirmDays after the last invite, and the
 * review starts (owner, 2026-10-12). The buyer still has the full review to report a problem. Not while the order is held for a safety check.
 */
async function autoConfirmAccess(o: Order, now: number): Promise<Order> {
  if (o.deliveryType !== 'repo_access' || o.state !== 'in_delivery') return o;
  const s = await inviteState(o, now);
  if (!s || now < s.invitedAt + CONFIG.repo.autoConfirmDays * DAY_MS || (await heldReason(o.id))) return o;
  const r = await move(o.id, 'delivered', { actorId: null, event: 'access_auto_confirmed', meta: { github: o.githubUsername ?? null, days: CONFIG.repo.autoConfirmDays }, now });
  return r.ok ? r.order : o;
}

/* The scheduled job: applies every due step to every open order. Returns how many orders moved. */
export async function runDueJobs(now = Date.now()): Promise<number> {
  const store = await orderStore();
  let moved = 0;
  for (const o of await store.open()) {
    let after = await tick(o, now);
    after = await autoConfirmAccess(after, now);
    await ensureLedger(after);
    await notifyReminders(after, now);
    if (after.state !== o.state) moved++;
  }
  // ensureLedger swallows its errors and the next run tries again; orders that already left the open states get that retry here.
  for (const o of await store.changedSince(now - CONFIG.cron.ledgerRecheckDays * 86_400_000)) await ensureLedger(o);
  return moved;
}
