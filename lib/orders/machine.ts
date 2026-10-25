import { CONFIG, DAY_MS, HOUR_MS, feeCents } from '../config';

/*
 * The order state machine. Pure: no database, no clock of its own (the caller passes `now`), so every rule can be tested.
 * Every change of state returns an event that the store writes to the append-only order_events table (the "proof of handover" log).
 *
 *   draft -> awaiting_payment -> funded -> in_delivery -> delivered -> accepted -> payout_pending -> paid_out
 *   funded / in_delivery -> overdue -> (delivered | cancelled)       delivered / accepted / payout_pending -> disputed
 *   disputed -> refunded | accepted | fix_requested -> delivered      delivered --review window ends--> accepted (auto_accepted)
 */
export const STATES = [
  'draft',
  'awaiting_payment',
  'funded',
  'in_delivery',
  'delivered',
  'accepted',
  'payout_pending',
  'paid_out',
  'disputed',
  'fix_requested',
  'overdue',
  'refunded',
  'cancelled',
] as const;
export type OrderState = (typeof STATES)[number];
export type OrderKind = 'product' | 'custom' | 'trial';
export type OrderPackage = 'asis' | 'setup' | 'custom';
export type DeliveryType = 'live_site' | 'download' | 'repo_access';
export type Line = [label: string, cents: number];

export const TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  draft: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['funded', 'cancelled'],
  funded: ['in_delivery', 'delivered', 'overdue', 'cancelled'],
  in_delivery: ['delivered', 'overdue', 'cancelled'],
  overdue: ['delivered', 'cancelled'],
  delivered: ['accepted', 'disputed'],
  accepted: ['payout_pending', 'disputed'],
  payout_pending: ['paid_out', 'disputed'],
  disputed: ['refunded', 'accepted', 'fix_requested'],
  fix_requested: ['delivered'],
  paid_out: [],
  refunded: [],
  cancelled: [],
};
export const canTransition = (from: OrderState, to: OrderState) => TRANSITIONS[from].includes(to);

/* The buyer's money is in escrow (or paid out of it). Files are released from here on, never before. */
export const FUNDED_STATES: readonly OrderState[] = ['funded', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out', 'disputed', 'fix_requested', 'overdue'];
export const isFundedState = (s: OrderState) => FUNDED_STATES.includes(s);
export const isOpenState = (s: OrderState) => !['paid_out', 'refunded', 'cancelled'].includes(s);

export type Order = {
  id: string;
  kind: OrderKind;
  pkg: OrderPackage;
  deliveryType: DeliveryType;
  state: OrderState;
  title: string;
  buyerId: string | null; // null: made signed out in demo mode
  sellerId: string | null; // null: a made-up starter listing, a demo seller delivers
  productId: string | null; // uuid of a real listing
  productKey: string | null; // slug or starter id
  devKey: string | null;
  brief?: string;
  lines: Line[];
  priceCents: number; // everything the buyer pays
  feeCents: number; // the platform's cut of the first line
  refundedCents: number; // part of the price given back to the buyer after a dispute
  currency: string;
  days: number;
  express: boolean;
  instant: boolean; // as-is downloads are delivered the moment they are funded
  demo: boolean; // paid through the fake provider
  domain?: { name: string; source: 'own' | 'new'; ref?: string; expires?: string };
  appName?: string;
  oses?: string[];
  githubUsername?: string;
  licence?: string;
  supportDays?: number; // digital products: what the listing promised when ordered (undefined on older orders)
  updateDays?: number;
  payment?: { ref: string; brand: string; last4: string };
  trialCreditFor?: string; // the finished trial whose fee was taken off this order's price
  attempts: number;
  createdAt: number;
  fundedAt?: number;
  dueAt?: number;
  deliveredAt?: number;
  reviewEndsAt?: number;
  acceptedAt?: number;
  payoutAfter?: number;
  bugfixUntil?: number;
  cancelledAt?: number;
};

export type OrderEvent = { orderId: string; actorId: string | null; event: string; from: OrderState | null; to: OrderState | null; meta: Record<string, unknown>; at: number };

export class IllegalTransition extends Error {
  constructor(
    public from: OrderState,
    public to: OrderState,
  ) {
    super(`An order cannot go from ${from} to ${to}.`);
  }
}

/* The seller's own price: the product or package line, plus the express delivery line if the buyer chose it. Domains, hosting and the AI add-on are pass-through extras. */
export const EXPRESS_LABEL = 'Express delivery (24 hours)';
export const baseCents = (lines: Line[]) => (lines[0]?.[1] ?? 0) + (lines.find((l, i) => i > 0 && l[0] === EXPRESS_LABEL)?.[1] ?? 0);

/* The fee is worked out on the seller's price (see baseCents). */
export const orderFee = (lines: Line[], kind: OrderKind) => feeCents(baseCents(lines), kind === 'product' ? 'sale' : 'custom');

type Ctx = { now: number; actorId?: string | null; event?: string; meta?: Record<string, unknown> };

/* Moves an order to a new state. Returns a new order and the event to log. Throws if the move is not allowed. */
export function transition(o: Order, to: OrderState, ctx: Ctx): { order: Order; event: OrderEvent } {
  if (!canTransition(o.state, to)) throw new IllegalTransition(o.state, to);
  const n: Order = { ...o, state: to };
  const at = ctx.now;
  if (to === 'funded') {
    n.fundedAt = at;
    n.dueAt = at + (o.express ? CONFIG.delivery.expressHours * HOUR_MS : o.days * DAY_MS);
  }
  if (to === 'delivered') {
    n.deliveredAt = at;
    n.reviewEndsAt = at + CONFIG.review.hours * HOUR_MS;
  }
  if (to === 'accepted' && !o.acceptedAt) {
    n.acceptedAt = at;
    n.payoutAfter = at + CONFIG.payout.holdDays * DAY_MS;
    n.bugfixUntil = at + CONFIG.bugFixDays * DAY_MS;
  }
  if (to === 'cancelled') n.cancelledAt = at;
  const event: OrderEvent = { orderId: o.id, actorId: ctx.actorId ?? null, event: ctx.event ?? `to_${to}`, from: o.state, to, meta: ctx.meta ?? {}, at };
  return { order: n, event };
}

/* Demo sellers: starter listings have no real seller, so a pretend one "builds" the order. Real orders wait for the real seller. */
export const DEMO = { startMs: 8_000, buildMs: 67_000 };

/*
 * Everything that is due by `now` because time has passed: the demo seller's delivery, the end of the review window (auto-accept),
 * the delivery deadline (overdue) and the end of the 7-day hold (payout pending). Returns the steps to apply, oldest first, each stamped
 * with the moment it became due, so an order that sat idle for days still gets the right dates.
 */
export function dueSteps(o: Order, now: number): { order: Order; event: OrderEvent }[] {
  const out: { order: Order; event: OrderEvent }[] = [];
  let cur = o;
  const step = (to: OrderState, at: number, event: string, meta: Record<string, unknown> = {}) => {
    const r = transition(cur, to, { now: at, actorId: null, event, meta });
    out.push(r);
    cur = r.order;
  };
  for (let guard = 0; guard < 8; guard++) {
    const before = cur.state;
    // A real seller's as-is download is delivered the moment it is paid: the files are ready, and the buyer's review time starts.
    if (cur.sellerId !== null && cur.instant && cur.state === 'funded' && cur.fundedAt !== undefined) step('delivered', cur.fundedAt, 'auto_delivered', { by: 'system' });
    if (cur.demo && cur.sellerId === null && cur.fundedAt !== undefined) {
      if (cur.deliveryType === 'repo_access') {
        // The demo seller sends the invite; the buyer must confirm access before the review starts.
        if (cur.state === 'funded' && now >= cur.fundedAt + DEMO.startMs) step('in_delivery', cur.fundedAt + DEMO.startMs, 'repo_invited', { by: 'demo seller', github: cur.githubUsername ?? null });
      } else if (cur.state === 'funded' && cur.instant) step('delivered', cur.fundedAt, 'auto_delivered', { by: 'system' });
      else if (cur.state === 'funded' && now >= cur.fundedAt + DEMO.startMs) step('in_delivery', cur.fundedAt + DEMO.startMs, 'demo_seller_started');
      else if (cur.state === 'in_delivery' && now >= cur.fundedAt + DEMO.startMs + DEMO.buildMs) step('delivered', cur.fundedAt + DEMO.startMs + DEMO.buildMs, 'demo_seller_delivered');
    }
    if (cur.state === 'delivered' && cur.reviewEndsAt !== undefined && now >= cur.reviewEndsAt) step('accepted', cur.reviewEndsAt, 'auto_accepted');
    // A repository order is in_delivery once the invite is sent: the buyer already has the code, so the clock cannot turn it overdue (and cancellable
    // for a full refund) just because the buyer never confirmed access.
    const invited = cur.deliveryType === 'repo_access' && cur.state === 'in_delivery';
    if (['funded', 'in_delivery'].includes(cur.state) && !invited && cur.dueAt !== undefined && now >= cur.dueAt) step('overdue', cur.dueAt, 'overdue');
    if (cur.state === 'accepted' && cur.payoutAfter !== undefined && now >= cur.payoutAfter) step('payout_pending', cur.payoutAfter, 'hold_ended');
    if (cur.state === before) break;
  }
  return out;
}
