import 'server-only';
import { auditList } from '../admin/audit';
import { opsQueues } from '../admin/opsQueues';
import { systemSnapshot, type Tone } from '../admin/system';
import { CONFIG, DAY_MS } from '../config';
import { openDisputes } from '../disputes';
import { acct } from '../ledger';
import { ledgerStore } from '../ledgerStore';
import { orderStore } from '../orders/store';
import type { Order } from '../orders/machine';
import { listPayouts } from '../payouts';
import { getSettings } from '../settings';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import { adminCounts } from './admin';

/*
 * The admin overview of design-reference/admin.html, from the real stores: sales and the platform's share for the chosen period, escrow,
 * what waits, the 48-hour review timers, the audit trail and the services. Any one source failing shows as empty, never as a broken page.
 */
export const PERIODS = { today: 'Today', '7d': '7 days', '30d': '30 days', month: 'This month' } as const;
export type Period = keyof typeof PERIODS;
export const isPeriod = (v: unknown): v is Period => typeof v === 'string' && Object.hasOwn(PERIODS, v);

const safe = async <T>(work: () => Promise<T>, fallback: T) => {
  try {
    return await work();
  } catch {
    return fallback;
  }
};

export function periodStart(p: Period, now = Date.now()): number {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (p === 'today') return midnight;
  if (p === '7d') return midnight - 6 * DAY_MS;
  if (p === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return midnight - 29 * DAY_MS;
}

/* Paid sales of an order (what the buyer paid less refunds); beta requests are $0. */
const paid = (o: Order) => (o.fundedAt ? Math.max(0, o.priceCents - o.refundedCents) : 0);

/* One value per UTC day from `from` to today: the paid sales funded that day. */
export function dailySales(orders: Order[], from: number, now = Date.now()): number[] {
  const days = Math.max(1, Math.floor((now - from) / DAY_MS) + 1);
  const out = new Array<number>(days).fill(0);
  for (const o of orders) {
    if (!o.fundedAt || o.fundedAt < from) continue;
    const i = Math.floor((o.fundedAt - from) / DAY_MS);
    if (i >= 0 && i < days) out[i] += paid(o);
  }
  return out;
}

export type Timer = { id: string; title: string; endsAt: number; share: number };
/* Orders in their buyer review: how much of the 48 hours has gone, soonest first. */
export function reviewTimers(orders: Order[], now = Date.now()): Timer[] {
  const span = CONFIG.review.hours * 3_600_000;
  return orders
    .filter((o) => o.state === 'delivered' && o.reviewEndsAt && o.reviewEndsAt > now)
    .map((o) => ({ id: o.id, title: o.title, endsAt: o.reviewEndsAt!, share: Math.min(1, Math.max(0, 1 - (o.reviewEndsAt! - now) / span)) }))
    .sort((a, b) => a.endsAt - b.endsAt);
}

/* Domains that run out within a week (renewal reminders). */
async function expiringDomains(now: number): Promise<number> {
  if (!supabaseConfigured) return 0;
  const { count, error } = await createAdminClient()
    .from('domains')
    .select('name', { count: 'exact', head: true })
    .gte('expires_at', new Date(now).toISOString())
    .lte('expires_at', new Date(now + 7 * DAY_MS).toISOString());
  return error ? 0 : (count ?? 0);
}

/* An audit action in words: "listing_approved" -> "Listing approved". */
export const actionText = (a: string) => (a.charAt(0).toUpperCase() + a.slice(1)).replace(/_/g, ' ');

async function adminNames(ids: string[]): Promise<Map<string, string>> {
  if (!supabaseConfigured || !ids.length) return new Map();
  const { data } = await createAdminClient().from('profiles').select('id, full_name').in('id', ids);
  return new Map((data ?? []).map((r: { id: string; full_name: string | null }) => [r.id, r.full_name || 'Admin']));
}

export async function adminOverview(period: Period, now = Date.now()) {
  const from = periodStart(period, now);
  const monthFrom = periodStart('month', now);
  const store = await orderStore();
  const L = await ledgerStore();
  const [orders, inReview, counts, ops, disputes, payouts, settings, escrow, revenue, audit, system] = await Promise.all([
    safe(() => store.changedSince(Math.min(from, monthFrom)), [] as Order[]),
    safe(() => store.byState(['delivered']), [] as Order[]),
    adminCounts(),
    safe(() => opsQueues(now), []),
    safe(openDisputes, []),
    safe(() => listPayouts({ status: ['scheduled', 'exported'] }), []),
    getSettings(),
    safe(async () => (await L.balances('order_escrow:')).reduce((s, b) => s + Math.max(0, b.holds), 0), 0),
    safe(() => L.balance(acct.revenue), 0),
    safe(() => auditList(5), []),
    safe(() => systemSnapshot(now), null),
  ]);
  const domainsSoon = await safe(() => expiringDomains(now), 0);
  const inPeriod = orders.filter((o) => o.fundedAt && o.fundedAt >= from);
  const gross = inPeriod.reduce((s, o) => s + paid(o), 0);
  const fees = inPeriod.reduce((s, o) => s + (o.fundedAt ? o.feeCents : 0), 0);
  const monthSales = orders.filter((o) => o.fundedAt && o.fundedAt >= monthFrom).reduce((s, o) => s + paid(o), 0);
  const toVerify = ops.find((q) => q.key === 'payments')?.n ?? 0;
  const oldestDispute = disputes.length ? Math.min(...disputes.map((d) => d.createdAt)) : null;
  const names = await safe(() => adminNames([...new Set(audit.map((a) => a.adminId).filter((x): x is string => !!x))]), new Map<string, string>());
  const health: { label: string; tone: Tone; text: string }[] = system?.services.slice(0, 6).map((s) => ({ label: s.label, tone: s.tone, text: s.text })) ?? [];
  return {
    period,
    gross,
    fees,
    escrow,
    revenue,
    inReview: inReview.length,
    toVerify,
    beta: counts.beta,
    disputes: disputes.length,
    oldestDispute,
    payoutsDue: payouts.reduce((s, p) => s + p.amountCents, 0),
    payoutsCount: payouts.length,
    payoutSellers: new Set(payouts.map((p) => p.sellerId)).size,
    domainsSoon,
    trend: dailySales(orders, from, now),
    monthSales,
    dayOfMonth: new Date(now).getUTCDate(),
    paymentsMode: settings.paymentsMode,
    counts,
    ops,
    timers: reviewTimers(inReview, now).slice(0, 4),
    activity: audit.map((a) => ({ id: a.id, who: a.adminId ? (names.get(a.adminId) ?? 'Admin') : 'System', action: a.action, target: a.targetRef, at: a.at })),
    overall: system?.overall ?? ('off' as Tone),
    health,
  };
}
