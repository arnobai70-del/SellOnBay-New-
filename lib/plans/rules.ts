import { CONFIG } from '../config';

/*
 * SellOnBay 2.0 seller plans (owner-approved F-1, O-1, O-2, O-3, O-4). Pure, so every rule is tested; storage is lib/plans/store.ts.
 *
 *  Free      $0                     15% commission   5 live listings
 *  Pro       $19/month, $193.80/yr  10% commission  25 live listings, featured placement
 *  Business  $49/month, $499.80/yr   5% commission 100 live listings, featured placement
 *
 * Commission is worked out on the seller's revenue lines: product, package, express, extra work, paid revisions and custom development (O-2).
 * Domain and hosting lines are excluded only when an admin has verified them as genuine pass-through costs (O-1); otherwise they count.
 * Platform-owned products have no external seller: the whole seller line goes to SellOnBay (O-2).
 * Orders made before plans keep the fee they recorded (legacy baseline) and are never recalculated.
 */
export const PLAN_CODES = ['free', 'pro', 'business'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];
export const isPlanCode = (c: unknown): c is PlanCode => typeof c === 'string' && (PLAN_CODES as readonly string[]).includes(c);

export type Plan = {
  id: string;
  code: PlanCode;
  version: number;
  name: string;
  monthlyCents: number;
  yearlyCents: number;
  commissionBps: number;
  listingLimit: number;
  featured: boolean;
};
export type Billing = 'monthly' | 'yearly';

const NAMES: Record<PlanCode, string> = { free: 'Free', pro: 'Pro', business: 'Business' };

/* The plans as approved, version 1, from lib/config.ts. The database seeds the same numbers (migration 0057; a test compares them). */
export const PLANS_V1: Record<PlanCode, Plan> = Object.fromEntries(
  PLAN_CODES.map((code) => {
    const p = CONFIG.plans[code];
    return [
      code,
      {
        id: `plan-${code}-1`,
        code,
        version: 1,
        name: NAMES[code],
        monthlyCents: p.monthlyCents,
        yearlyCents: p.yearlyCents,
        commissionBps: p.commissionBps,
        listingLimit: p.listingLimit,
        featured: p.featured,
      },
    ];
  }),
) as Record<PlanCode, Plan>;

/* The flat plan every seller is on (owner, 2026-11-07): version 2 of 'free' in the database (migration 0074). A test compares the numbers. */
export const FLAT_PLAN: Plan = { ...PLANS_V1.free, id: 'plan-free-2', version: 2, name: 'Standard', commissionBps: CONFIG.flatPlan.commissionBps, listingLimit: CONFIG.flatPlan.listingLimit };

/* 12 months less the yearly discount, in whole cents. */
export const yearlyFromMonthly = (monthlyCents: number, discountBps = CONFIG.yearlyDiscountBps) => Math.round((monthlyCents * 12 * (10_000 - discountBps)) / 10_000);
export const priceFor = (plan: Plan, billing: Billing) => (billing === 'yearly' ? plan.yearlyCents : plan.monthlyCents);

/* ---------- commission ---------- */

export const LINE_KINDS = ['product', 'package', 'express', 'extra', 'revision', 'custom', 'domain', 'hosting'] as const;
export type LineKind = (typeof LINE_KINDS)[number];
const PASS_THROUGH_KINDS: readonly LineKind[] = ['domain', 'hosting'];

/* One priced line of a quotation. `passThroughVerified` is set only by an admin, and only means anything on a domain or hosting line. */
export type PricedLine = { label: string; cents: number; kind: LineKind; passThroughVerified?: boolean };

export const isPassThrough = (l: PricedLine) => PASS_THROUGH_KINDS.includes(l.kind) && l.passThroughVerified === true;

export type Commission = { sellerGrossCents: number; feeCents: number; sellerNetCents: number; passThroughCents: number; totalCents: number };

/* The fee on a set of lines under a plan. Rounded half up to whole cents, like the old fees; seller net + fee always equals seller gross. */
export function commissionFor(lines: readonly PricedLine[], plan: Pick<Plan, 'commissionBps'>, ownerType: 'seller' | 'platform' = 'seller'): Commission {
  for (const l of lines) if (!Number.isInteger(l.cents) || l.cents < 0) throw new Error(`Bad amount on "${l.label}".`);
  const passThroughCents = lines.filter(isPassThrough).reduce((s, l) => s + l.cents, 0);
  const sellerGrossCents = lines.filter((l) => !isPassThrough(l)).reduce((s, l) => s + l.cents, 0);
  const feeCents = ownerType === 'platform' ? sellerGrossCents : Math.round((sellerGrossCents * plan.commissionBps) / 10_000);
  return { sellerGrossCents, feeCents, sellerNetCents: sellerGrossCents - feeCents, passThroughCents, totalCents: sellerGrossCents + passThroughCents };
}

/* ---------- listing limits (O-3) ---------- */

/*
 * May this seller publish one more listing? The limit counts live listings plus the ones waiting for review. Listings already published stay
 * published after a downgrade; only new publishing is refused while over the limit.
 */
export function mayPublishAnother(liveOrWaiting: number, plan: Pick<Plan, 'listingLimit' | 'name'>): { ok: true } | { ok: false; error: string } {
  if (liveOrWaiting < plan.listingLimit) return { ok: true };
  return {
    ok: false,
    error: `Your ${plan.name} plan allows ${plan.listingLimit} published listings, and you have ${liveOrWaiting}. Pause or remove one, or move to a bigger plan, to publish another.`,
  };
}

/* ---------- subscriptions (O-4: every change is an admin decision, recorded) ---------- */

export const SUB_STATES = ['requested', 'pending_payment', 'active', 'renewal_due', 'renewal_failed', 'cancelling', 'ended'] as const;
export type SubState = (typeof SUB_STATES)[number];

export const SUB_MOVES: Record<SubState, readonly SubState[]> = {
  requested: ['pending_payment', 'active', 'ended'],
  pending_payment: ['active', 'ended'],
  active: ['renewal_due', 'cancelling', 'ended'],
  renewal_due: ['active', 'renewal_failed', 'ended'],
  renewal_failed: ['active', 'ended'],
  cancelling: ['active', 'ended'],
  ended: [],
};
export const mayMove = (from: SubState, to: SubState) => SUB_MOVES[from].includes(to);

/* While the subscription is in one of these states the seller has the plan's benefits. A failed renewal keeps them until an admin decides (O-4). */
export const BENEFIT_STATES: readonly SubState[] = ['active', 'renewal_due', 'renewal_failed', 'cancelling'];
export const givesBenefits = (s: SubState) => BENEFIT_STATES.includes(s);
