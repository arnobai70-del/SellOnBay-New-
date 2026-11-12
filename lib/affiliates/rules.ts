/*
 * The affiliate program's rules (owner, 2026-11-12), pure and tested. Every value here is only a default: the live values are the setting
 * 'affiliates:settings' (Admin › Affiliate Management), read by lib/affiliates/service.ts. Commissions are paid on verified, non-refunded sales
 * only, never for recruiting affiliates; nothing is guaranteed, and nobody is charged automatically.
 */

export const COMMISSION_KINDS = ['first_purchase', 'repeat_purchase', 'buyer_sub_new', 'buyer_sub_renewal', 'seller_sub'] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];
export const KIND_LABEL: Record<CommissionKind, string> = {
  first_purchase: 'First website purchase',
  repeat_purchase: 'Repeat website purchase',
  buyer_sub_new: 'New buyer subscription',
  buyer_sub_renewal: 'Buyer subscription renewal',
  seller_sub: 'Seller paid subscription',
};

export type BadgeKind = 'verified' | 'sales' | 'champion';
export type Badge = { key: string; name: string; icon: string; color: string; kind: BadgeKind; threshold: number; reward: string; enabled: boolean };
export type Settings = {
  enabled: boolean;
  feeCents: number; // the standard registration fee
  promoActive: boolean; // the promotion waives the fee at sign-up
  promoFeeCents: number; // the fee during the promotion (0 = waived)
  qualificationDays: number;
  targetSales: number; // verified, paid, non-refunded sales within the qualification days
  waiveFeeOnQualify: boolean;
  rates: Record<CommissionKind, number>; // basis points
  kindsEnabled: Record<CommissionKind, boolean>;
  cookieDays: number;
  minWithdrawalCents: number;
  holdDays: number; // days after acceptance (or payment, for subscriptions) before a commission is approved
  eligible: { mode: 'all' | 'list'; include: string[]; exclude: string[] }; // website listings that earn commission
  badges: Badge[];
  benefits: { text: string; on: boolean }[];
  leaderboardPublic: boolean;
  termsVersion: string;
  terms: string;
  intro: string;
  faq: { q: string; a: string }[];
  notify: { qualified: boolean; commissionApproved: boolean; withdrawalDecided: boolean };
  fraud: { blockSelfReferral: boolean; maxClicksPerVisitorPerDay: number; holdNewAffiliateDays: number };
};

export const DEFAULT_BADGES: Badge[] = [
  { key: 'verified', name: 'SellOnBay Verified Affiliate', icon: '✓', color: '#1A8F5C', kind: 'verified', threshold: 0, reward: '', enabled: true },
  { key: 'sales-10', name: '10 verified sales', icon: '★', color: '#5FA88F', kind: 'sales', threshold: 10, reward: '', enabled: true },
  { key: 'sales-25', name: '25 verified sales', icon: '★', color: '#2B3DFF', kind: 'sales', threshold: 25, reward: '', enabled: true },
  { key: 'sales-50', name: '50 verified sales', icon: '★', color: '#7A4DD8', kind: 'sales', threshold: 50, reward: '', enabled: true },
  { key: 'sales-100', name: '100 verified sales', icon: '★', color: '#E0B44B', kind: 'sales', threshold: 100, reward: '', enabled: true },
  { key: 'champion', name: 'Monthly Champion', icon: '♛', color: '#E0B44B', kind: 'champion', threshold: 0, reward: '', enabled: true },
];

export const DEFAULTS: Settings = {
  enabled: false,
  feeCents: 1500,
  promoActive: true,
  promoFeeCents: 0,
  qualificationDays: 60,
  targetSales: 3,
  waiveFeeOnQualify: true,
  rates: { first_purchase: 1500, repeat_purchase: 500, buyer_sub_new: 1500, buyer_sub_renewal: 500, seller_sub: 1000 },
  kindsEnabled: { first_purchase: true, repeat_purchase: true, buyer_sub_new: true, buyer_sub_renewal: true, seller_sub: true },
  cookieDays: 60,
  minWithdrawalCents: 5000,
  holdDays: 7,
  eligible: { mode: 'all', include: [], exclude: [] },
  badges: DEFAULT_BADGES,
  benefits: [
    { text: 'Free to join during the promotion', on: true },
    { text: 'Your own link for every website', on: true },
    { text: 'Clear dashboard with every click, sale and commission', on: true },
  ],
  leaderboardPublic: true,
  termsVersion: 'aff-2026-11',
  terms:
    'Commissions are paid on verified, paid and non-refunded sales only, after the refund period. Refunded sales reverse their commission. Referring yourself, fake purchases and paid or misleading ads that use SellOnBay as a keyword are not allowed. Earnings are not guaranteed, and nothing is paid for recruiting other affiliates. Disclose that you earn a commission when you share a link.',
  intro: 'Share SellOnBay websites with your audience and earn a commission on every verified sale.',
  faq: [],
  notify: { qualified: true, commissionApproved: true, withdrawalDecided: true },
  fraud: { blockSelfReferral: true, maxClicksPerVisitorPerDay: 20, holdNewAffiliateDays: 0 },
};

const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : d;
};
const str = (v: unknown, max: number, d = '') => (typeof v === 'string' ? v.trim().slice(0, max) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const keys = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,120}$/.test(x)).slice(0, 500) : []);

/* Saved settings (or an admin's form), cleaned: anything missing or out of range falls back to the default. */
export function cleanSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rates = (r.rates ?? {}) as Record<string, unknown>;
  const kinds = (r.kindsEnabled ?? {}) as Record<string, unknown>;
  const el = (r.eligible ?? {}) as Record<string, unknown>;
  const fr = (r.fraud ?? {}) as Record<string, unknown>;
  const nt = (r.notify ?? {}) as Record<string, unknown>;
  const badges = Array.isArray(r.badges)
    ? r.badges
        .map((b, i): Badge => {
          const x = (b ?? {}) as Record<string, unknown>;
          const kind = (['verified', 'sales', 'champion'] as const).find((k) => k === x.kind) ?? 'sales';
          return {
            key: str(x.key, 40) || `badge-${i + 1}`,
            name: str(x.name, 60) || 'Badge',
            icon: str(x.icon, 4) || '★',
            color: /^#[0-9A-Fa-f]{6}$/.test(String(x.color)) ? String(x.color) : '#5FA88F',
            kind,
            threshold: int(x.threshold, 0, 100_000, 0),
            reward: str(x.reward, 120),
            enabled: bool(x.enabled, true),
          };
        })
        .slice(0, 20)
    : DEFAULTS.badges;
  return {
    enabled: bool(r.enabled, DEFAULTS.enabled),
    feeCents: int(r.feeCents, 0, 1_000_000, DEFAULTS.feeCents),
    promoActive: bool(r.promoActive, DEFAULTS.promoActive),
    promoFeeCents: int(r.promoFeeCents, 0, 1_000_000, DEFAULTS.promoFeeCents),
    qualificationDays: int(r.qualificationDays, 1, 3650, DEFAULTS.qualificationDays),
    targetSales: int(r.targetSales, 0, 10_000, DEFAULTS.targetSales),
    waiveFeeOnQualify: bool(r.waiveFeeOnQualify, DEFAULTS.waiveFeeOnQualify),
    rates: Object.fromEntries(COMMISSION_KINDS.map((k) => [k, int(rates[k], 0, 10_000, DEFAULTS.rates[k])])) as Settings['rates'],
    kindsEnabled: Object.fromEntries(COMMISSION_KINDS.map((k) => [k, bool(kinds[k], DEFAULTS.kindsEnabled[k])])) as Settings['kindsEnabled'],
    cookieDays: int(r.cookieDays, 1, 365, DEFAULTS.cookieDays),
    minWithdrawalCents: int(r.minWithdrawalCents, 100, 10_000_000, DEFAULTS.minWithdrawalCents),
    holdDays: int(r.holdDays, 0, 365, DEFAULTS.holdDays),
    eligible: { mode: el.mode === 'list' ? 'list' : 'all', include: keys(el.include), exclude: keys(el.exclude) },
    badges,
    benefits: Array.isArray(r.benefits)
      ? r.benefits
          .map((b) => ({ text: str((b as { text?: unknown })?.text, 120), on: (b as { on?: unknown })?.on !== false }))
          .filter((b) => b.text)
          .slice(0, 20)
      : DEFAULTS.benefits,
    leaderboardPublic: bool(r.leaderboardPublic, DEFAULTS.leaderboardPublic),
    termsVersion: str(r.termsVersion, 40) || DEFAULTS.termsVersion,
    terms: str(r.terms, 6000) || DEFAULTS.terms,
    intro: str(r.intro, 600) || DEFAULTS.intro,
    faq: Array.isArray(r.faq)
      ? r.faq
          .map((x) => ({ q: str((x as { q?: unknown })?.q, 200), a: str((x as { a?: unknown })?.a, 1200) }))
          .filter((x) => x.q && x.a)
          .slice(0, 20)
      : [],
    notify: { qualified: bool(nt.qualified, true), commissionApproved: bool(nt.commissionApproved, true), withdrawalDecided: bool(nt.withdrawalDecided, true) },
    fraud: {
      blockSelfReferral: bool(fr.blockSelfReferral, true),
      maxClicksPerVisitorPerDay: int(fr.maxClicksPerVisitorPerDay, 1, 10_000, DEFAULTS.fraud.maxClicksPerVisitorPerDay),
      holdNewAffiliateDays: int(fr.holdNewAffiliateDays, 0, 365, DEFAULTS.fraud.holdNewAffiliateDays),
    },
  };
}

/* The fee that applies to someone joining now: the promotion price while it runs, else the standard fee. Never charged automatically. */
export const joinFeeCents = (s: Settings) => (s.promoActive ? s.promoFeeCents : s.feeCents);

/* Does this listing earn commission? A listing named in "exclude" never does; mode "list" only the ones named in "include". */
export const productEligible = (s: Settings, productKey: string) => !s.eligible.exclude.includes(productKey) && (s.eligible.mode === 'all' || s.eligible.include.includes(productKey));

/* The commission on an eligible net amount: basis × rate, rounded down, never below zero. */
export const commissionCents = (basisCents: number, rateBps: number) => Math.max(0, Math.floor((Math.max(0, basisCents) * rateBps) / 10_000));

/*
 * The eligible net amount of an order: what the buyer paid for the website and its options, less refunds, never pass-through money
 * (domain registration, hosting) nor taxes, which are not part of the price.
 */
export function orderBasisCents(o: { lines: [string, number][]; refundedCents: number }, passThroughLabels: RegExp = /domain|hosting|tax/i): number {
  const gross = o.lines.filter(([label]) => !passThroughLabels.test(label)).reduce((s, [, c]) => s + Math.max(0, c), 0);
  return Math.max(0, gross - Math.max(0, o.refundedCents));
}

/* Website purchases: the buyer's first paid order is a "first purchase", every later one a "repeat purchase". */
export const purchaseKind = (paidOrdersBefore: number): CommissionKind => (paidOrdersBefore > 0 ? 'repeat_purchase' : 'first_purchase');

/* The sale is the affiliate's own (self-referral): never commissioned while the rule is on. */
export const isSelfReferral = (s: Settings, affiliateUserId: string, customerId: string | null | undefined) => s.fraud.blockSelfReferral && !!customerId && affiliateUserId === customerId;

/* A referral cookie still counts: issued within the cookie days. */
export const withinWindow = (s: Settings, issuedAt: number, now: number) => issuedAt <= now && now - issuedAt <= s.cookieDays * 86_400_000;

export type AffStatus = 'pending' | 'qualified' | 'suspended' | 'rejected';
export const STATUS_LABEL: Record<AffStatus, string> = { pending: 'Qualification pending', qualified: 'Verified affiliate', suspended: 'Suspended', rejected: 'Rejected' };
export const STATUS_TONE: Record<AffStatus, string> = { pending: 'st-wait', qualified: 'st-ok', suspended: 'st-bad', rejected: 'st-bad' };
export const ADMIN_MOVES: Record<AffStatus, AffStatus[]> = {
  pending: ['qualified', 'suspended', 'rejected'],
  qualified: ['suspended'],
  suspended: ['pending', 'qualified'],
  rejected: ['pending'],
};
/* May this affiliate earn? Pending and verified affiliates earn; suspended and rejected ones do not. */
export const mayEarn = (status: AffStatus) => status === 'pending' || status === 'qualified';

/* Qualification: a pending affiliate qualifies once their verified sales reach the target within the window (an admin may also verify by hand). */
export function qualifies(s: Settings, a: { status: AffStatus; qualificationEndsAt: number }, verifiedSalesInWindow: number, now: number) {
  return a.status === 'pending' && now <= a.qualificationEndsAt && verifiedSalesInWindow >= s.targetSales;
}

/* Badges earned now, from verified (approved, non-reversed) sales; a reversal can take a sales badge away again. */
export function earnedBadges(s: Settings, a: { status: AffStatus }, verifiedSales: number, championMonths: number): Badge[] {
  return s.badges.filter((b) => b.enabled && (b.kind === 'verified' ? a.status === 'qualified' : b.kind === 'sales' ? verifiedSales >= b.threshold && b.threshold > 0 : championMonths > 0));
}

export type LeaderRow = { affiliateId: string; name: string; sales: number; netCents: number; qualified: boolean; public: boolean };
/* The month's ranking: verified sales first, eligible net revenue as the tie-breaker, then name, so the order never flickers. */
export const rankLeaders = (rows: LeaderRow[]) =>
  [...rows].filter((r) => r.sales > 0).sort((a, b) => b.sales - a.sales || b.netCents - a.netCents || a.name.localeCompare(b.name) || a.affiliateId.localeCompare(b.affiliateId));

/* Balances from the append-only ledger and the open withdrawal: available never counts money already requested or paid. */
export function balances(ledger: { kind: string; amount_cents: number }[], openWithdrawalCents: number) {
  const earned = ledger.filter((e) => e.kind === 'commission').reduce((s, e) => s + e.amount_cents, 0);
  const reversed = ledger.filter((e) => e.kind === 'reversal').reduce((s, e) => s - e.amount_cents, 0);
  const paid = ledger.filter((e) => e.kind === 'withdrawal' || e.kind === 'withdrawal_returned').reduce((s, e) => s - e.amount_cents, 0);
  const total = ledger.reduce((s, e) => s + e.amount_cents, 0);
  return { earnedCents: earned, reversedCents: reversed, paidCents: paid, availableCents: Math.max(0, total - openWithdrawalCents) };
}

/* A withdrawal request, checked against the minimum and what is available. */
export function checkWithdrawal(s: Settings, amountCents: number, availableCents: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'Enter an amount.';
  if (amountCents < s.minWithdrawalCents) return `The minimum withdrawal is $${(s.minWithdrawalCents / 100).toFixed(2)}.`;
  if (amountCents > availableCents) return 'That is more than your available balance.';
  return null;
}

/* A referral code: AFF + 6 letters and digits (no 0/O/1/I so it reads cleanly). */
export const makeCode = (rand: () => number = Math.random) => 'AFF' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(rand() * 32)]).join('');
export const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9]{4,16}$/.test(v);

/* Payout details are kept server-side and shown masked: the last 4 characters only. */
export const maskDetails = (d: string) => (d.length <= 4 ? '••••' : '••••' + d.slice(-4));
