/*
 * Buyer subscriptions (owner, 2026-11-12): the rules, pure and tested. Every plan value comes from the admin panel (buyer_sub_plans); this file
 * only checks and computes. Expiry ends the licence to keep using the code and the free support; it never switches off a website or deletes
 * files a buyer already downloaded. A renewal extends the websites already chosen; it adds no new picks.
 */
import { couponLive, type Coupon } from '../marketing/coupons';

export type Period = 'month' | 'year' | 'custom';
export type Benefit = { text: string; on: boolean };
export type Eligibility = { mode: 'all' | 'list'; categories: string[]; include: string[]; exclude: string[] };
export type Plan = {
  id: string;
  key: string;
  name: string;
  description: string;
  badge: string;
  color: string;
  sort: number;
  priceCents: number;
  renewalCents: number;
  period: Period;
  periodDays: number;
  websiteLimit: number;
  supportDays: number;
  benefits: Benefit[];
  features: Record<string, boolean>;
  eligibility: Eligibility;
  licenceVersion: string;
  refundPolicy: string;
  active: boolean;
  visible: boolean;
  archivedAt: number | null;
};
export type SubStatus = 'pending_payment' | 'payment_review' | 'active' | 'suspended' | 'cancelled' | 'expired' | 'rejected';
export type Snapshot = Pick<Plan, 'key' | 'name' | 'priceCents' | 'renewalCents' | 'period' | 'periodDays' | 'websiteLimit' | 'supportDays' | 'licenceVersion' | 'refundPolicy'> & {
  benefits: string[];
};
export type Subscription = {
  id: string;
  buyerId: string;
  planId: string;
  plan: Snapshot;
  status: SubStatus;
  creditsTotal: number;
  creditsUsed: number;
  amountCents: number;
  couponCode: string | null;
  startsAt: number | null;
  expiresAt: number | null;
  remindedAt: number | null;
  createdAt: number;
};
export type Selection = { id: string; subscriptionId: string; productId: string; productKey: string; orderId: string | null; licenceExpiresAt: number; supportUntil: number; createdAt: number };
export type SubPayment = {
  id: string;
  subscriptionId: string;
  kind: 'new' | 'renewal';
  amountCents: number;
  methodLabel: string;
  reference: string;
  paidOn: string | null;
  status: 'submitted' | 'verified' | 'rejected';
  createdAt: number;
};

export const DAY = 86_400_000;
export const FEATURE_KEYS = ['source_code', 'support', 'bug_fixes', 'updates', 'priority_support', 'setup_help'] as const;
export const FEATURE_LABEL: Record<(typeof FEATURE_KEYS)[number], string> = {
  source_code: 'Full source code',
  support: 'Technical support',
  bug_fixes: 'Free bug fixes',
  updates: 'Updates to the chosen websites',
  priority_support: 'Priority support',
  setup_help: 'Setup help',
};
export const PERIOD_LABEL: Record<Period, string> = { month: 'month', year: 'year', custom: 'term' };
export const STATUS_LABEL: Record<SubStatus, string> = {
  pending_payment: 'Waiting for payment',
  payment_review: 'Payment being checked',
  active: 'Active',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
  expired: 'Expired',
  rejected: 'Rejected',
};
export const STATUS_TONE: Record<SubStatus, string> = {
  pending_payment: 'st-wait',
  payment_review: 'st-info',
  active: 'st-ok',
  suspended: 'st-bad',
  cancelled: 'st-draft',
  expired: 'st-draft',
  rejected: 'st-bad',
};
/* The admin's moves on a subscription; anything else is refused. */
export const ADMIN_MOVES: Record<SubStatus, SubStatus[]> = {
  pending_payment: ['active', 'rejected', 'cancelled'],
  payment_review: ['active', 'rejected', 'cancelled'],
  active: ['suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
  expired: [],
  rejected: [],
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,120}$/.test(x)).slice(0, max) : []);

/* Days a plan runs for: a year is 365, a month 30, a custom term its own number. */
export const daysOf = (p: Pick<Plan, 'period' | 'periodDays'>) => (p.period === 'year' ? 365 : p.period === 'month' ? 30 : p.periodDays);

/* An admin's plan form, checked. Prices are in cents. */
export function checkPlan(raw: Record<string, unknown>): { ok: true; value: Omit<Plan, 'id' | 'archivedAt'> } | { ok: false; error: string } {
  const key = str(raw.key, 40).toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return { ok: false, error: 'The plan key uses 2 to 40 lowercase letters, numbers and dashes.' };
  const name = str(raw.name, 60);
  if (!name) return { ok: false, error: 'Give the plan a name.' };
  const priceCents = int(raw.priceCents, 0, 10_000_000);
  const renewalCents = int(raw.renewalCents, 0, 10_000_000);
  if (priceCents === null || renewalCents === null) return { ok: false, error: 'Prices are whole cents from $0 to $100,000.' };
  const period = (['month', 'year', 'custom'] as const).find((p) => p === raw.period) ?? null;
  if (!period) return { ok: false, error: 'The term is monthly, yearly or custom.' };
  const periodDays = int(raw.periodDays ?? 365, 1, 3650);
  if (periodDays === null) return { ok: false, error: 'A custom term is 1 to 3650 days.' };
  const websiteLimit = int(raw.websiteLimit, 0, 1000);
  if (websiteLimit === null) return { ok: false, error: 'The number of websites is 0 to 1000.' };
  const supportDays = int(raw.supportDays, 0, 3650);
  if (supportDays === null) return { ok: false, error: 'Support is 0 to 3650 days.' };
  const color = str(raw.color, 7) || '#5FA88F';
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return { ok: false, error: 'The colour is a hex value like #5FA88F.' };
  const benefits = Array.isArray(raw.benefits)
    ? raw.benefits
        .map((b) => ({ text: str((b as Benefit)?.text, 120), on: (b as Benefit)?.on !== false }))
        .filter((b) => b.text)
        .slice(0, 20)
    : [];
  const f = (raw.features ?? {}) as Record<string, unknown>;
  const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, f[k] === true]));
  const e = (raw.eligibility ?? {}) as Record<string, unknown>;
  const eligibility: Eligibility = { mode: e.mode === 'list' ? 'list' : 'all', categories: list(e.categories, 50), include: list(e.include, 500), exclude: list(e.exclude, 500) };
  return {
    ok: true,
    value: {
      key,
      name,
      description: str(raw.description, 600),
      badge: str(raw.badge, 30),
      color,
      sort: int(raw.sort, -1000, 1000) ?? 0,
      priceCents,
      renewalCents,
      period,
      periodDays: period === 'custom' ? periodDays : period === 'year' ? 365 : 30,
      websiteLimit,
      supportDays,
      benefits,
      features,
      eligibility,
      licenceVersion: str(raw.licenceVersion, 40) || 'sub-2026-11',
      refundPolicy: str(raw.refundPolicy, 2000),
      active: raw.active !== false,
      visible: raw.visible !== false,
    },
  };
}

/* What the buyer bought, frozen at checkout: later plan edits never change a running subscription. */
export const snapshotOf = (p: Plan): Snapshot => ({
  key: p.key,
  name: p.name,
  priceCents: p.priceCents,
  renewalCents: p.renewalCents,
  period: p.period,
  periodDays: daysOf(p),
  websiteLimit: p.websiteLimit,
  supportDays: p.supportDays,
  licenceVersion: p.licenceVersion,
  refundPolicy: p.refundPolicy,
  benefits: p.benefits.filter((b) => b.on).map((b) => b.text),
});

/* Price after a coupon (Admin › Marketing coupons), never below zero. */
export function priceWithCoupon(cents: number, code: string | null | undefined, coupons: Coupon[], today: string): { cents: number; coupon: Coupon | null; error?: string } {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return { cents, coupon: null };
  const found = coupons.find((x) => x.code.toUpperCase() === c);
  if (!found || !couponLive(found, today)) return { cents, coupon: null, error: 'This coupon is not valid.' };
  return { cents: Math.max(0, Math.round((cents * (100 - found.percentOff)) / 100)), coupon: found };
}

/*
 * May this website be chosen with this plan? A website named in "exclude" never can, one named in "include" always can. Otherwise, mode "all":
 * every category except those listed; mode "list": only the categories listed.
 */
export function eligible(e: Eligibility, product: { id: string; category: string }): boolean {
  if (e.exclude.includes(product.id)) return false;
  if (e.include.includes(product.id)) return true;
  return e.mode === 'all' ? !e.categories.includes(product.category) : e.categories.includes(product.category);
}

/* Shown to the public and buyable: active, visible and not archived, in the admin's order. */
export const shownPlans = (plans: Plan[]) => plans.filter((p) => p.active && p.visible && !p.archivedAt).sort((a, b) => a.sort - b.sort || a.priceCents - b.priceCents);

/* A subscription that is active now (status and date both). */
export const isLive = (s: Pick<Subscription, 'status' | 'expiresAt'>, now: number) => s.status === 'active' && !!s.expiresAt && s.expiresAt > now;
export const creditsLeft = (s: Pick<Subscription, 'creditsTotal' | 'creditsUsed'>) => Math.max(0, s.creditsTotal - s.creditsUsed);

/* Starting a paid subscription: today, for the plan's term, with its number of websites. */
export const activation = (snap: Snapshot, now: number) => ({ startsAt: now, expiresAt: now + snap.periodDays * DAY, creditsTotal: snap.websiteLimit });

/* A renewal adds one term to the later of now and the current end; the websites already chosen get the same new end. No new credits. */
export const renewedUntil = (snap: Snapshot, expiresAt: number | null, now: number) => Math.max(now, expiresAt ?? now) + snap.periodDays * DAY;

/* Days added by an admin's "extend", checked. */
export const checkExtendDays = (v: unknown) => int(v, 1, 3650);

/* Expiry reminders go out this many days before the end (once per subscription per term). */
export const REMIND_DAYS = 14;
export const dueForReminder = (s: Subscription, now: number) => isLive(s, now) && !!s.expiresAt && s.expiresAt - now <= REMIND_DAYS * DAY && (!s.remindedAt || s.remindedAt < (s.startsAt ?? 0));

/* A manual payment reference, checked (letters, digits and simple separators). */
export function checkReference(raw: unknown): string | null {
  const r = str(raw, 80);
  return r.length >= 3 && /^[\w\s\-_/.:#]+$/.test(r) ? r : null;
}
