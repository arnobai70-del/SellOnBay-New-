import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '@/lib/affiliates/rules';

/*
 * The signed-in affiliate dashboard, rendered on the server with real data from the program's own store (owner, 2026-11-12). The demo build
 * has no accounts and purchases now need a quotation, so a browser cannot reach an affiliate with money; this renders the same page the
 * browser gets, for a signed-in account, after a referred sale was approved and a withdrawal paid.
 */
vi.mock('server-only', () => ({}));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => undefined) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {} }),
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) }));
vi.mock('@/lib/supabase/viewer', () => ({ requireViewer: vi.fn(async () => ({ id: 'dash-user', role: 'buyer', name: 'Dash User', scopes: [] })) }));
vi.mock('@/components/glass/BuyerShell', () => ({
  BuyerShell: ({ children, title }: { children: ReactNode; title: string }) => createElement('main', null, createElement('h1', null, title), children),
}));
vi.mock('@/lib/glass/catalog', () => ({ publicWebsites: vi.fn(async () => [{ id: 'shop-one', name: 'Shop One' }]), websitePath: (id: string) => `/websites/${id}` }));
const orders = new Map<string, Record<string, unknown>>();
vi.mock('@/lib/orders/service', async (orig) => ({ ...(await orig<object>()), getOrder: vi.fn(async (id: string) => orders.get(id) ?? null) }));

const DAY = 86_400_000;
const render = async () => {
  const { default: Page } = await import('@/app/(dash)/dashboard/buyer/affiliate/page');
  return renderToStaticMarkup(await Page());
};

describe('affiliate dashboard, signed in (server render)', () => {
  it('before joining: the join form with the fee words; while off: coming soon', async () => {
    const svc = await import('@/lib/affiliates/service');
    let html = await render();
    expect(html).toContain('Coming soon');
    await svc.saveAffSettings(null, { ...DEFAULTS, enabled: true });
    html = await render();
    expect(html).toContain('Join the affiliate program');
    expect(html).toContain('Free during the promotion (normally $15.00)');
    expect(html).toContain('no new account is needed');
  });

  it('after a referred sale, an approved commission and a paid withdrawal: every part of the dashboard shows it', async () => {
    const svc = await import('@/lib/affiliates/service');
    await svc.saveAffSettings(null, { ...DEFAULTS, enabled: true, holdDays: 7, targetSales: 1, minWithdrawalCents: 1000 });
    const j = await svc.joinProgram('dash-user', 'Dash Picks', true);
    if (!j.ok) throw new Error(j.error);
    const click = await svc.recordClick(j.value.code, 'shop-one', 'visitor-1');
    if (!click.ok) throw new Error(click.error);
    const ref = svc.readRef(click.value.cookie)!;
    const now = Date.now();
    orders.set('d1', {
      id: 'd1',
      kind: 'product',
      fundedAt: now - 20 * DAY,
      acceptedAt: now - 10 * DAY,
      priceCents: 20000,
      productKey: 'shop-one',
      state: 'accepted',
      lines: [['Website', 20000]],
      refundedCents: 0,
      buyerId: 'b1',
      createdAt: now - 20 * DAY,
    });
    orders.set('d2', {
      id: 'd2',
      kind: 'product',
      fundedAt: now - 2 * DAY,
      acceptedAt: null,
      priceCents: 5000,
      productKey: 'shop-one',
      state: 'in_delivery',
      lines: [['Website', 5000]],
      refundedCents: 0,
      buyerId: 'b2',
      createdAt: now - 2 * DAY,
    });
    expect(await svc.attribute('signup', 'b1', 'b1', '', ref)).toBe(true);
    expect(await svc.attribute('order', 'd1', 'b1', 'shop-one', ref)).toBe(true);
    expect(await svc.attribute('order', 'd2', 'b2', 'shop-one', ref)).toBe(true);
    await svc.runAffiliateJobs(now);
    await svc.runAffiliateJobs(now);
    await svc.updateProfile('dash-user', { payoutMethod: 'PayPal', payoutDetails: 'dash@example.com' });
    const w = await svc.requestWithdrawal('dash-user', 1000);
    if (!w.ok) throw new Error(w.error);
    await svc.decideWithdrawal('admin', w.value.id, 'approve', '');
    await svc.decideWithdrawal('admin', w.value.id, 'paid', 'PP-DASH-1');

    const html = await render();
    expect(html).toContain('Dash Picks');
    expect(html).toContain(`Code ${j.value.code}`);
    expect(html).toContain('✓ Verified affiliate'); // qualified with 1 verified sale (target 1), green badge
    expect(html).toContain('SellOnBay Verified Affiliate');
    expect(html).toMatch(/Clicks<\/div><div class="v">1</);
    expect(html).toMatch(/Leads<\/div><div class="v">1</);
    expect(html).toMatch(/Verified sales<\/div><div class="v">1</);
    expect(html).toContain('$7.50'); // the pending 15% of $50
    expect(html).toContain('$20.00'); // available: $30 earned less the $10 paid
    expect(html).toContain('$10.00 paid out');
    expect(html).toMatch(/This month<\/div><div class="v">#1</);
    expect(html).toContain('First website purchase · 15%');
    expect(html).toContain('Approved');
    expect(html).toMatch(/st-wait">Pending<\/span>/); // the order still in delivery: no approval date until it is accepted
    expect(html).toContain('Paid · PP-DASH-1');
    expect(html).toContain('PayPal ••••.com');
    expect(html).toContain(`?ref=${j.value.code}`);
    expect(html).toContain('Shop One'); // the eligible website in the link generator
    expect(html).toContain('A visitor you referred made an account'); // activity
    expect(html).not.toContain('b1'); // never a buyer's id or details
    expect(html).not.toContain('dash@example.com'); // payout details only masked
  });

  it('the dashboard page and the demo stand-in are only for a server marked as a demo', () => {
    const page = readFileSync('app/(dash)/dashboard/buyer/affiliate/page.tsx', 'utf8');
    const api = readFileSync('app/api/affiliates/route.ts', 'utf8');
    expect(page).toMatch(/!supabaseConfigured && mayUseDemoAdmin\(process\.env\)/);
    expect(api).toMatch(/!supabaseConfigured && !mayUseDemoAdmin\(process\.env\)\) return NextResponse\.json\(\{ error: 'Sign in first\.' \}, \{ status: 401 \}\)/);
    // the buyer's own quotation acceptance records the referral (the old instant checkout is closed)
    expect(readFileSync('lib/requests/service.ts', 'utf8')).toMatch(/attributeFromRequest\('order', orderId, buyerId/);
  });
});
