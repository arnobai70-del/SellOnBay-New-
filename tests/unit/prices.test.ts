import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { dueSaleSteps, lowestBefore, priceShown, saleProblem, type HistoryRow, type Sale } from '@/lib/prices/rules';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const D = DAY_MS;
const row = (priceCents: number, fromDaysAgo: number, toDaysAgo: number | null, fromCreation = false): HistoryRow => ({
  priceCents,
  from: NOW - fromDaysAgo * D,
  to: toDaysAgo === null ? null : NOW - toDaysAgo * D,
  fromCreation,
});
const sale = (o: Partial<Sale> = {}): Sale => ({
  id: 's1',
  kind: 'sale',
  regularCents: 8500,
  saleCents: 5000,
  startsAt: NOW - D,
  endsAt: NOW + 5 * D,
  startedAt: NOW - D,
  endedAt: null,
  cancelledAt: null,
  ...o,
});

describe('the 30-day rule (EU): a "was" price only when it was the lowest of the 30 days before the sale', () => {
  it('shows ~~$85~~ $50 when $85 was the lowest price for the whole 30 days', () => {
    const h = [row(8500, 90, 1), row(5000, 1, null)];
    expect(priceShown(5000, h, [sale()], NOW)).toEqual({ priceCents: 5000, wasCents: 8500, badge: 'Sale', note: 'Sale ends in 5 days' });
  });
  it('shows no "was" price when the price was lower at some point in those 30 days (the raise-then-discount trick)', () => {
    const h = [row(4900, 60, 10), row(8500, 10, 1), row(5000, 1, null)];
    expect(lowestBefore(h, NOW - D)).toBe(4900);
    expect(priceShown(5000, h, [sale()], NOW).wasCents).toBeUndefined();
  });
  it('shows no "was" price when the history does not cover the 30 days (listings older than the history)', () => {
    const h = [row(8500, 10, 1), row(5000, 1, null)];
    expect(lowestBefore(h, NOW - D)).toBeNull();
    expect(priceShown(5000, h, [sale()], NOW).wasCents).toBeUndefined();
  });
  it('a history that starts at the listing creation counts as complete', () => {
    const h = [row(8500, 10, 1, true), row(5000, 1, null)];
    expect(priceShown(5000, h, [sale()], NOW).wasCents).toBe(8500);
  });
  it('a launch price never strikes anything through and names the regular price and its date', () => {
    const s = priceShown(5000, [row(5000, 3, null, true)], [sale({ kind: 'launch' })], NOW);
    expect(s.wasCents).toBeUndefined();
    expect(s.note).toBe('Launch price $50 · $85 from Nov 13, 2026');
  });
});

describe('the automatic switch', () => {
  it('starts a sale at its time and ends it when it is over; a sale that never started just closes', () => {
    const planned = sale({ startedAt: null, startsAt: NOW - 60_000 });
    const over = sale({ id: 's2', endsAt: NOW - 1 });
    const missed = sale({ id: 's3', startedAt: null, startsAt: NOW - 3 * D, endsAt: NOW - D });
    const r = dueSaleSteps([planned, over, missed, sale({ id: 's4', cancelledAt: NOW - D })], NOW);
    expect(r.start.map((s) => s.id)).toEqual(['s1']);
    expect(r.end.map((s) => s.id)).toEqual(['s2', 's3']);
    expect(priceShown(8500, [], [sale({ endedAt: NOW - 1 })], NOW)).toEqual({ priceCents: 8500 }); // after the end: the regular price, no badge
  });
  it('the job puts the regular price back only for a sale that really started, and the database trigger records every price', () => {
    const svc = readFileSync('lib/prices/service.ts', 'utf8');
    expect(svc).toMatch(/if \(x\.startedAt\) await db\.from\('products'\)\.update\(\{ price_cents: x\.regularCents \}\)/);
    const m = readFileSync('supabase/migrations/0084_listing_prices.sql', 'utf8');
    expect(m).toMatch(/after insert or update of price_cents on products/);
    expect(m).toMatch(/ends_at <= starts_at \+ interval '30 days'/);
    expect(m).toMatch(/sale_cents >= 2000 and sale_cents < regular_cents/);
    expect(readFileSync('app/api/cron/orders/route.ts', 'utf8')).toMatch(/runSaleJobs\(\)/);
  });
});

describe('sale rules', () => {
  const ctx = { now: NOW, priceCents: 8500, sales: [] as Sale[], history: [row(8500, 90, null)] };
  const input = { kind: 'sale' as const, saleCents: 5000, startsAt: NOW + D, endsAt: NOW + 10 * D };
  it('needs at least $20, below the price, at most 30 days, not in the past', () => {
    expect(saleProblem(input, ctx)).toBeNull();
    expect(saleProblem({ ...input, saleCents: 1900 }, ctx)).toMatch(/at least \$20/);
    expect(saleProblem({ ...input, saleCents: 8500 }, ctx)).toMatch(/lower than/);
    expect(saleProblem({ ...input, endsAt: NOW + 32 * D }, ctx)).toMatch(/30 days/);
    expect(saleProblem({ ...input, startsAt: NOW - D }, ctx)).toMatch(/past/);
  });
  it('blocks a repeat sale until 30 days after the last one ended, and a second open one', () => {
    const ended = sale({ startsAt: NOW - 20 * D, endsAt: NOW - 10 * D, endedAt: NOW - 10 * D });
    expect(saleProblem(input, { ...ctx, sales: [ended] })).toMatch(/can start from/);
    expect(saleProblem({ ...input, startsAt: NOW + 21 * D, endsAt: NOW + 25 * D }, { ...ctx, sales: [ended] })).toBeNull();
    expect(saleProblem(input, { ...ctx, sales: [sale({ startedAt: null, startsAt: NOW + 2 * D })] })).toMatch(/already has a sale/);
    expect(saleProblem(input, { ...ctx, sales: [sale({ cancelledAt: NOW - D, endedAt: NOW - D })] })).toBeNull(); // a cancelled sale does not block
  });
  it('a launch price is only for a new listing whose price never changed', () => {
    expect(saleProblem({ ...input, kind: 'launch' }, { ...ctx, history: [row(8500, 3, null, true)] })).toBeNull();
    expect(saleProblem({ ...input, kind: 'launch' }, ctx)).toMatch(/new listing/);
    expect(saleProblem({ ...input, kind: 'launch' }, { ...ctx, history: [row(9000, 9, 3, true), row(8500, 3, null)] })).toMatch(/new listing/);
  });
});
