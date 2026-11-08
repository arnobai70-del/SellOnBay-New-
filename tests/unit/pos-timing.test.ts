import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { acct, cashReceived, checkEntry, heldToEscrow } from '@/lib/ledger';
import { keep, p95, routeOf, sampleEvery, statusClass, type Sample } from '@/lib/timingCore';

const src = (p: string) => readFileSync(p, 'utf8');

describe('cash at a point of sale (owner, 2026-11-08)', () => {
  it('goes into cash on hand, held for the order, then into escrow like a reconciled transfer', () => {
    const e = cashReceived('o1', 'R-1001', 4900);
    checkEntry(e);
    expect(e.key).toBe('cash-in:R-1001'); // one receipt counts once
    expect(e.lines).toEqual([
      { account: acct.cashOnHand, amountCents: 4900, side: 'debit' },
      { account: acct.held('o1'), amountCents: 4900, side: 'credit' },
    ]);
    expect(heldToEscrow('o1', 4900).key).toBe('pay:o1');
  });
  it('is Finance only, closed in the free beta, and audited before anything changes', () => {
    expect(src('app/api/admin/pos/route.ts')).toMatch(/adminOnly\('finance'\)/);
    const s = src('lib/pos/service.ts');
    expect(s).toMatch(/paymentsMode !== 'live'\) return fail\(409/);
    expect(s.indexOf("auditStrict(adminId, 'cash_received'")).toBeLessThan(s.indexOf('.insert(order'));
    expect(s).toMatch(/startsWith|MANUAL_REF\}cash:/);
    expect(src('app/(dash)/admin/orders/page.tsx')).toMatch(/settings\.paymentsMode === 'live' && \(\s*<GlassCard as="section" id="pos">/);
    expect(src('components/glass/AdminShell.tsx')).toMatch(/hideCta=\{settings\.paymentsMode === 'beta_free'\}/);
  });
});

describe('request timing', () => {
  it('keeps the route shape only', () => {
    expect(routeOf('/api/orders/4d2c1a9e-1111-2222-3333-444455556666/deliver?token=abc')).toBe('/api/orders/[id]/deliver');
    expect(routeOf('/api/admin/verifications/123/file')).toBe('/api/admin/verifications/[id]/file');
    expect(routeOf('/api/search?q=me@example.com')).toBe('/api/search');
    expect(statusClass(404)).toBe('4xx');
  });
  it('samples every second request by default and can be turned off', () => {
    expect(sampleEvery({})).toBe(2);
    expect(sampleEvery({ REQUEST_TIMING_SAMPLE: '0' })).toBe(0);
    expect(sampleEvery({ REQUEST_TIMING_SAMPLE: 'x' })).toBe(2);
  });
  it('p95 over the last hour, none with fewer than 20', () => {
    const list: Sample[] = [];
    for (let i = 1; i <= 100; i++) keep(list, { at: 1000 + i, route: '/api/x', method: 'GET', status: '2xx', ms: i });
    expect(p95(list, 2000)).toEqual({ p95: 95, count: 100 });
    expect(p95(list.slice(0, 10), 2000).p95).toBeNull();
    expect(p95(list, 1000 + 3_600_000 + 50).count).toBe(51);
  });
  it('is one hook from instrumentation.ts that reads only the method and the path', () => {
    expect(src('instrumentation.ts')).toMatch(/installTiming\(http\)/);
    const t = src('lib/timing.ts');
    expect(t).not.toMatch(/req\.headers|req\.on\('data'|\.body/);
  });
});

describe('site builder reset', () => {
  it('saves an empty value instead of deleting the row', () => {
    const s = src('lib/site/contentStore.ts');
    expect(s).not.toMatch(/\.delete\(\)/);
    expect(s).toMatch(/value: value \?\? \[\]/);
  });
});

describe('ledger reads', () => {
  it('use the column names migration 0018 gave the table (entry_id, direction)', () => {
    const s = src('lib/ledgerStore.ts');
    expect(s).toMatch(/\.select\('account, amount_cents, direction'\)\.eq\('entry_id', key\)/);
    expect(src('supabase/migrations/0018_ledger_spec_shape.sql')).toMatch(/entry_id/);
  });
});
