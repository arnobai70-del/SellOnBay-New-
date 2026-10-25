import 'server-only';
import { CONFIG, DAY_MS, HOUR_MS } from './config';
import { disputesForOrder } from './disputes';
import { acct } from './ledger';
import { ledgerStore } from './ledgerStore';
import { heldReason } from './holdStore';
import { unreadCount } from './notify';
import { listExtras, type ChangeRequest } from './orders/extra';
import type { Order } from './orders/machine';
import { orderStore } from './orders/store';
import { listPayouts, sellerEarnings, weekStartOf, type Payout } from './payouts';
import { createAdminClient } from './supabase/server';
import { pendingForSeller, type Checklist } from './repoAccess';
import { versionsOf } from './versions';
import { payoutLabel } from './payoutDetails';

/*
 * What the buyer and seller dashboards show: the person's own orders, money and listings, read from the real stores. Nothing here is made up:
 * a new account sees empty states. Pure helpers (onTimeShare, weeklyBuckets) are exported so they can be tested.
 */
const ACCEPTED = ['accepted', 'payout_pending', 'paid_out'];
const IN_PROGRESS = ['funded', 'in_delivery', 'delivered', 'disputed', 'fix_requested', 'overdue'];
const pg = async () => (await orderStore()).kind === 'postgres';

/* Share of delivered orders that were delivered on or before their deadline. Null when nothing was delivered yet. */
export function onTimeShare(orders: Pick<Order, 'deliveredAt' | 'dueAt'>[]): number | null {
  const done = orders.filter((o) => o.deliveredAt !== undefined && o.dueAt !== undefined);
  if (!done.length) return null;
  return done.filter((o) => o.deliveredAt! <= o.dueAt!).length / done.length;
}

/* Sums per payout week (Sunday), the last `weeks` weeks ending with the current one, oldest first. */
export function weeklyBuckets(items: { at: number; cents: number }[], now: number, weeks = 8): { week: string; cents: number }[] {
  const start = Date.parse(weekStartOf(now) + 'T00:00:00Z');
  const out = Array.from({ length: weeks }, (_, i) => ({ week: new Date(start - (weeks - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10), cents: 0 }));
  for (const it of items) {
    const w = weekStartOf(it.at);
    const b = out.find((x) => x.week === w);
    if (b) b.cents += it.cents;
  }
  return out;
}
export const nextPayoutDay = (now: number) => new Date(Date.parse(weekStartOf(now) + 'T00:00:00Z') + 7 * DAY_MS).toISOString().slice(0, 10);

/* ---------- buyer ---------- */
export type BuyerView = {
  orders: Order[];
  needsReview: { order: Order; hoursLeft: number }[];
  liveSites: number;
  inProgress: number;
  totalSpentCents: number;
  extras: { order: Order; request: ChangeRequest }[];
  unread: number;
};
export async function buyerDashboard(userId: string, now = Date.now()): Promise<BuyerView> {
  const all = await (await orderStore()).forUser(userId);
  const orders = all.filter((o) => o.buyerId === userId && o.state !== 'cancelled' && o.state !== 'refunded' && (!!o.fundedAt || o.state === 'awaiting_payment'));
  const extras: BuyerView['extras'] = [];
  for (const o of orders) for (const r of await listExtras(o.id)) if (r.state === 'pending') extras.push({ order: o, request: r });
  return {
    orders,
    needsReview: orders.filter((o) => o.state === 'delivered' && o.reviewEndsAt).map((o) => ({ order: o, hoursLeft: Math.max(0, Math.ceil((o.reviewEndsAt! - now) / HOUR_MS)) })),
    liveSites: orders.filter((o) => ACCEPTED.includes(o.state) && o.domain).length,
    inProgress: orders.filter((o) => IN_PROGRESS.includes(o.state)).length,
    totalSpentCents: orders.filter((o) => !!o.fundedAt).reduce((s, o) => s + o.priceCents - o.refundedCents, 0),
    extras,
    unread: await unreadCount(userId),
  };
}

/* ---------- seller ---------- */
export type SellerListing = {
  slug: string;
  name: string;
  status: string;
  priceCents: number;
  ratingAvg: number | null;
  ratingCount: number;
  digital: boolean;
  reviewNote: string | null; // what the admin wrote when sending it back or declining it
  versions: { version: string; status: string }[]; // newest first (digital products)
};
export type SellerView = {
  toDeliver: { order: Order; earnCents: number; held: boolean }[];
  availableCents: number;
  pendingCents: number;
  reserveCents: number; // kept back for some days after the payout hold (lib/reserve.ts)
  debtCents: number; // owed back after a refund or fee the seller could not cover; taken from the next earnings
  escrowCents: number;
  lifetimeCents: number;
  acceptedCount: number;
  weekly: { week: string; cents: number }[];
  extras: { order: Order; request: ChangeRequest }[];
  listings: SellerListing[];
  payouts: Payout[];
  health: {
    onTime: number | null;
    rating: number | null;
    ratingCount: number;
    disputeRate: number | null;
    verified: { email: boolean; phone: boolean; id: boolean; payout: boolean } | null;
    payoutLabel: string | null;
  };
  nextPayout: string;
  revocations: Checklist[]; // repository access to take back after a refund
};
export async function sellerDashboard(userId: string, now = Date.now()): Promise<SellerView> {
  const orders = (await (await orderStore()).forUser(userId)).filter((o) => o.sellerId === userId);
  const L = await ledgerStore();
  const bal = (account: string) => L.balance(account); // one exact account: an equality lookup, no LIKE pattern
  const live = orders.filter((o) => IN_PROGRESS.includes(o.state));
  let escrow = 0;
  for (const o of live) escrow += Math.max(0, await L.balance(acct.escrow(o.id)));
  const accepted = orders.filter((o) => ACCEPTED.includes(o.state) && o.acceptedAt);
  const earnings = await Promise.all(accepted.map(async (o) => ({ at: o.acceptedAt!, cents: await sellerEarnings(o) })));
  const toDeliver = await Promise.all(
    orders
      .filter((o) => ['funded', 'in_delivery', 'overdue', 'fix_requested'].includes(o.state))
      .map(async (o) => ({ order: o, earnCents: await sellerEarnings(o), held: !!(await heldReason(o.id)) })),
  );
  const extras: SellerView['extras'] = [];
  for (const o of orders) for (const r of await listExtras(o.id)) extras.push({ order: o, request: r });

  let listings: SellerListing[] = [];
  let verified: SellerView['health']['verified'] = null;
  let payout: string | null = null;
  if (await pg()) {
    const db = createAdminClient();
    const { data } = await db
      .from('products')
      .select('id, slug, name, status, price_cents, rating_avg, rating_count, platform, review_note')
      .eq('seller_id', userId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50);
    listings = (data ?? []).map((r) => ({
      slug: r.slug,
      name: r.name,
      status: r.status,
      priceCents: r.price_cents,
      ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
      ratingCount: r.rating_count ?? 0,
      digital: r.platform === 'digital',
      reviewNote: r.status === 'rejected' && typeof r.review_note === 'string' && r.review_note ? r.review_note : null,
      versions: [],
    }));
    for (const l of listings) if (l.digital) l.versions = (await versionsOf(l.slug)).slice(0, 5).map((v) => ({ version: v.version, status: v.status }));
    const { data: sp } = await db.from('seller_profiles').select('email_verified, phone_verified, id_verified, payout_method, payout_ref').eq('user_id', userId).maybeSingle();
    verified = sp
      ? { email: !!sp.email_verified, phone: !!sp.phone_verified, id: !!sp.id_verified, payout: !!sp.payout_method && !!sp.payout_ref }
      : { email: false, phone: false, id: false, payout: false };
    payout = payoutLabel(sp?.payout_method, sp?.payout_ref);
  }
  const rated = listings.filter((l) => l.ratingCount > 0);
  const ratingCount = rated.reduce((s, l) => s + l.ratingCount, 0);
  let disputed = 0;
  for (const o of orders.filter((x) => !!x.fundedAt)) if ((await disputesForOrder(o.id)).length) disputed++;
  const funded = orders.filter((o) => !!o.fundedAt).length;
  return {
    toDeliver,
    availableCents: await bal(acct.available(userId)),
    pendingCents: await bal(acct.pending(userId)),
    reserveCents: await bal(acct.reserve(userId)),
    debtCents: await bal(acct.debt(userId)),
    escrowCents: escrow,
    lifetimeCents: earnings.reduce((s, e) => s + e.cents, 0),
    acceptedCount: accepted.length,
    weekly: weeklyBuckets(earnings, now, CONFIG.dashboard.chartWeeks),
    extras,
    listings,
    payouts: await listPayouts({ sellerId: userId }),
    health: {
      onTime: onTimeShare(orders),
      rating: ratingCount ? Math.round((rated.reduce((s, l) => s + (l.ratingAvg ?? 0) * l.ratingCount, 0) / ratingCount) * 10) / 10 : null,
      ratingCount,
      disputeRate: funded ? disputed / funded : null,
      verified,
      payoutLabel: payout,
    },
    nextPayout: nextPayoutDay(now),
    revocations: await pendingForSeller(userId),
  };
}
