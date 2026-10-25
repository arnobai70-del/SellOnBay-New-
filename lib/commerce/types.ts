import { DEMO, type Line, type Order, type OrderEvent, type OrderState } from '../orders/machine';

/* What the browser may see of an order. The order itself and its rules live in lib/orders; the timeline here is a view of the real state and its log. */
export type { Line };
export { DEMO };

export type Stage = 'awaiting_payment' | 'queued' | 'building' | 'delivered' | 'accepted' | 'cancelled';
export type Progress = { stage: Stage; pct: number; autoAccepted: boolean; deliveredAt?: number; reviewEndsAt?: number; acceptedAt?: number; payoutAfter?: number; bugfixUntil?: number };

const ACCEPTED: readonly OrderState[] = ['accepted', 'payout_pending', 'paid_out'];

export function progress(o: Order, events: OrderEvent[], now = Date.now()): Progress {
  const autoAccepted = events.some((e) => e.event === 'auto_accepted');
  const base = { autoAccepted, deliveredAt: o.deliveredAt, reviewEndsAt: o.reviewEndsAt, acceptedAt: o.acceptedAt, payoutAfter: o.payoutAfter, bugfixUntil: o.bugfixUntil };
  if (o.state === 'draft' || o.state === 'awaiting_payment') return { stage: 'awaiting_payment', pct: 0, autoAccepted: false };
  if (o.state === 'cancelled' || o.state === 'refunded') return { stage: 'cancelled', pct: 0, ...base };
  if (ACCEPTED.includes(o.state)) return { stage: 'accepted', pct: 100, ...base };
  if (o.state === 'delivered' || o.state === 'disputed' || o.state === 'fix_requested') return { stage: o.deliveredAt ? 'delivered' : 'building', pct: 100, ...base };
  // funded, in delivery or overdue: waiting for the seller
  const since = now - (o.fundedAt ?? now);
  if (o.state === 'funded' && since < DEMO.startMs && o.demo && !o.sellerId) return { stage: 'queued', pct: 0, ...base };
  const pct = o.demo && !o.sellerId ? Math.round(((since - DEMO.startMs) / DEMO.buildMs) * 100) : Math.round((since / Math.max(1, (o.dueAt ?? now + 1) - (o.fundedAt ?? now))) * 100);
  return { stage: 'building', pct: Math.min(99, Math.max(0, pct)), ...base };
}

export type ExtraView = { id: string; title: string; priceCents: number; addDays: number; state: string };
export type DisputeView = { id: string; status: string; reason: string; decision?: string; sellerDueAt: number };
/* What a digital product promised, for the order page. The until-times run from the purchase; null means none. */
export type OrderInfo = {
  requirements: string | null;
  docsUrl: string | null;
  supportDays: number;
  updateDays: number;
  supportUntil: number | null;
  updateUntil: number | null;
  /* Versions the buyer is entitled to, newest first. `isNew` is true when the newest one came out after they paid. */
  versions: { current: string | null; isNew: boolean; list: { version: string; changelog: string; at: number }[] };
};

/* Repository delivery: when the GitHub invite runs out, and how the take-back after a refund stands. */
export type OrderRepo = { invitedAt: number | null; expiresAt: number | null; expired: boolean; resends: number; revoke: 'pending' | 'seller_done' | 'confirmed' | null };

export const publicView = (
  o: Order,
  events: OrderEvent[] = [],
  extras: ExtraView[] = [],
  dispute: { current?: DisputeView; canOpen?: boolean; review?: { rating: number; body: string } | null; canReview?: boolean; held?: boolean; info?: OrderInfo | null; repo?: OrderRepo | null } = {},
) => ({
  id: o.id,
  kind: o.kind === 'product' ? ('site' as const) : ('hire' as const),
  state: o.state,
  instant: o.instant,
  real: !!o.sellerId, // a real seller's order: no demo controls
  title: o.title,
  productId: o.productKey ?? undefined,
  dev: o.devKey ?? undefined,
  pack: o.kind === 'trial' ? 'Trial' : undefined,
  lines: o.lines,
  totalCents: o.priceCents,
  days: o.days,
  domain: o.domain,
  appName: o.appName,
  oses: o.oses,
  github: o.githubUsername,
  createdAt: o.createdAt,
  paidAt: o.fundedAt,
  dueAt: o.dueAt,
  payment: o.payment,
  progress: progress(o, events),
  now: Date.now(),
  extras,
  dispute: dispute.current ?? null,
  canDispute: !!dispute.canOpen,
  review: dispute.review ?? null,
  canReview: !!dispute.canReview,
  held: !!dispute.held,
  info: dispute.info ?? null,
  repo: dispute.repo ?? null,
  certificate: ['accepted', 'payout_pending', 'paid_out'].includes(o.state) && events.some((e) => e.event === 'certificate_issued'),
  events: events.map((e) => ({ event: e.event, from: e.from, to: e.to, at: e.at })),
});
export type OrderView = ReturnType<typeof publicView>;
