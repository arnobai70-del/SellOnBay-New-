import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/config';
import { PLANS_V1, commissionFor, mayMove, mayPublishAnother, priceFor, yearlyFromMonthly, givesBenefits, type PricedLine } from '@/lib/plans/rules';

describe('approved seller plans (F-1, O-3)', () => {
  it('prices, rates and limits are exactly the approved ones', () => {
    expect(PLANS_V1.free).toMatchObject({ monthlyCents: 0, yearlyCents: 0, commissionBps: 1500, listingLimit: 5, featured: false });
    expect(PLANS_V1.pro).toMatchObject({ monthlyCents: 1900, yearlyCents: 19380, commissionBps: 1000, listingLimit: 25, featured: true });
    expect(PLANS_V1.business).toMatchObject({ monthlyCents: 4900, yearlyCents: 49980, commissionBps: 500, listingLimit: 100, featured: true });
    expect(CONFIG.yearlyDiscountBps).toBe(1500);
  });
  it('yearly is 12 months less 15%: $193.80 and $499.80', () => {
    expect(yearlyFromMonthly(1900)).toBe(19380);
    expect(yearlyFromMonthly(4900)).toBe(49980);
    for (const p of Object.values(PLANS_V1)) expect(p.yearlyCents).toBe(yearlyFromMonthly(p.monthlyCents));
    expect(priceFor(PLANS_V1.pro, 'monthly')).toBe(1900);
    expect(priceFor(PLANS_V1.pro, 'yearly')).toBe(19380);
  });
  it('the database seeds the same numbers as the code', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '0057_seller_plans.sql'), 'utf8');
    expect(sql).toContain("('free', 1, 'Free', 0, 0, 1500, 5, false, true)");
    expect(sql).toContain("('pro', 1, 'Pro', 1900, 19380, 1000, 25, true, true)");
    expect(sql).toContain("('business', 1, 'Business', 4900, 49980, 500, 100, true, true)");
  });
});

describe('commission (O-1, O-2)', () => {
  const lines: PricedLine[] = [
    { label: 'Template', cents: 4900, kind: 'product' },
    { label: 'Setup help', cents: 3000, kind: 'package' },
    { label: 'Domain example.com (1 year)', cents: 1200, kind: 'domain', passThroughVerified: true },
  ];
  it('is charged on product, work and extra lines; a verified domain or hosting line is excluded', () => {
    expect(commissionFor(lines, PLANS_V1.free)).toEqual({ sellerGrossCents: 7900, feeCents: 1185, sellerNetCents: 6715, passThroughCents: 1200, totalCents: 9100 });
    expect(commissionFor(lines, PLANS_V1.pro).feeCents).toBe(790);
    expect(commissionFor(lines, PLANS_V1.business).feeCents).toBe(395);
  });
  it('a domain or hosting line an admin has not verified as pass-through counts as seller revenue', () => {
    const unverified = lines.map((l) => (l.kind === 'domain' ? { ...l, passThroughVerified: false } : l));
    expect(commissionFor(unverified, PLANS_V1.free)).toMatchObject({ sellerGrossCents: 9100, passThroughCents: 0, feeCents: 1365 });
    // only domain and hosting lines can ever be pass-through
    expect(commissionFor([{ label: 'Work', cents: 1000, kind: 'custom', passThroughVerified: true }], PLANS_V1.free).feeCents).toBe(150);
  });
  it('custom development, extra work and paid revisions use the plan rate too', () => {
    for (const kind of ['custom', 'extra', 'revision'] as const) expect(commissionFor([{ label: kind, cents: 10_000, kind }], PLANS_V1.pro).feeCents).toBe(1000);
  });
  it('platform-owned products have no seller split: SellOnBay keeps the seller lines', () => {
    expect(commissionFor(lines, PLANS_V1.free, 'platform')).toMatchObject({ feeCents: 7900, sellerNetCents: 0, passThroughCents: 1200 });
  });
  it('rounds half up to whole cents and seller net plus fee is always the gross', () => {
    const c = commissionFor([{ label: 'x', cents: 999, kind: 'product' }], PLANS_V1.free); // 149.85 -> 150
    expect(c.feeCents).toBe(150);
    expect(c.feeCents + c.sellerNetCents).toBe(c.sellerGrossCents);
    expect(() => commissionFor([{ label: 'bad', cents: -1, kind: 'product' }], PLANS_V1.free)).toThrow();
    expect(() => commissionFor([{ label: 'bad', cents: 1.5, kind: 'product' }], PLANS_V1.free)).toThrow();
  });
});

describe('listing limits (O-3)', () => {
  it('Free 5, Pro 25, Business 100; at the limit a new one is refused with a clear reason', () => {
    expect(mayPublishAnother(4, PLANS_V1.free)).toEqual({ ok: true });
    const r = mayPublishAnother(5, PLANS_V1.free);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Free plan allows 5/);
    expect(mayPublishAnother(24, PLANS_V1.pro).ok).toBe(true);
    expect(mayPublishAnother(25, PLANS_V1.pro).ok).toBe(false);
    expect(mayPublishAnother(99, PLANS_V1.business).ok).toBe(true);
    expect(mayPublishAnother(100, PLANS_V1.business).ok).toBe(false);
  });
  it('after a downgrade, existing listings are not touched: only new publishing is blocked while over', () => {
    expect(mayPublishAnother(20, PLANS_V1.free).ok).toBe(false); // 20 stay live; no 21st
  });
});

describe('subscription moves (O-4)', () => {
  it('only the listed moves are allowed; an ended subscription stays ended', () => {
    expect(mayMove('requested', 'active')).toBe(true);
    expect(mayMove('active', 'renewal_due')).toBe(true);
    expect(mayMove('renewal_due', 'renewal_failed')).toBe(true);
    expect(mayMove('renewal_failed', 'active')).toBe(true);
    expect(mayMove('ended', 'active')).toBe(false);
    expect(mayMove('requested', 'renewal_due')).toBe(false);
  });
  it('benefits last while active, due, failed (until an admin decides) and cancelling', () => {
    expect(givesBenefits('active')).toBe(true);
    expect(givesBenefits('renewal_failed')).toBe(true);
    expect(givesBenefits('requested')).toBe(false);
    expect(givesBenefits('pending_payment')).toBe(false);
    expect(givesBenefits('ended')).toBe(false);
  });
});
