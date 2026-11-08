import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { closedForPath, maintenanceHtml, fromPage } from '@/lib/maintenance/guard';
import { maintenanceForm } from '@/lib/maintenance/form';
import { allowedIp, forgetRows, memoryAllow, memoryPages, memoryRows, upcomingMaintenance, type ModuleRow } from '@/lib/maintenance/state';
import { ipsProblem, pageProblem } from '@/lib/maintenance/service';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const row = (key: ModuleRow['key'], o: Partial<ModuleRow> = {}): ModuleRow => ({ key, enabled: true, message: '', startAt: null, endAt: null, updatedBy: null, updatedAt: 0, ...o });
const page = (path: string, o: object = {}) => ({ path, enabled: true, message: '', startAt: null, endAt: null, bannerMinutes: 0, updatedBy: null, updatedAt: 0, ...o });
afterEach(() => {
  memoryRows.clear();
  memoryPages.clear();
  memoryAllow([]);
  forgetRows();
});

describe('maintenance areas (owner, 2026-11-08)', () => {
  it('the whole site closes pages and APIs, but never sign-in, the admin or the money routes', async () => {
    memoryRows.set('site', row('site'));
    forgetRows();
    expect((await closedForPath('/websites', NOW))?.key).toBe('site');
    expect((await closedForPath('/api/cart', NOW))?.api).toBe(true);
    for (const p of ['/signin', '/admin', '/admin/settings/maintenance', '/dashboard/admin', '/api/admin/maintenance/area', '/api/webhooks/payment', '/api/cron/orders', '/api/health'])
      expect(await closedForPath(p, NOW), p).toBeNull();
  });
  it('a single page closes itself and what is under it, nothing else', async () => {
    memoryPages.set('/domains', page('/domains'));
    forgetRows();
    expect((await closedForPath('/domains', NOW))?.key).toBe('page:/domains');
    expect((await closedForPath('/domains/x', NOW))?.key).toBe('page:/domains');
    expect(await closedForPath('/domainsx', NOW)).toBeNull();
    expect(await closedForPath('/websites', NOW)).toBeNull();
  });
  it('the new areas close their own pages and APIs', async () => {
    memoryRows.set('cart', row('cart'));
    memoryRows.set('search', row('search'));
    forgetRows();
    expect((await closedForPath('/cart', NOW))?.key).toBe('cart');
    expect((await closedForPath('/api/search', NOW))?.key).toBe('search');
    expect(await closedForPath('/checkout', NOW)).toBeNull();
  });
  it('shows the notice only inside its banner time before the start', async () => {
    memoryRows.set('checkout', row('checkout', { startAt: NOW + 30 * 60_000, bannerMinutes: 60 }));
    memoryRows.set('domains', row('domains', { startAt: NOW + 3 * 3_600_000, bannerMinutes: 60 }));
    forgetRows();
    expect((await upcomingMaintenance(NOW)).map((x) => x.label)).toEqual(['Checkout & payment']);
    expect(await closedForPath('/checkout', NOW)).toBeNull(); // not started yet
  });
  it('an allow-listed address counts only when the address header is trusted', async () => {
    memoryAllow(['203.0.113.7']);
    forgetRows();
    const before = { ...process.env };
    delete process.env.CLIENT_IP_HEADER;
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(await allowedIp('203.0.113.7', NOW)).toBe(false);
    process.env.TRUSTED_PROXY_HOPS = '1';
    expect(await allowedIp('203.0.113.7', NOW)).toBe(true);
    expect(await allowedIp('203.0.113.8', NOW)).toBe(false);
    process.env = before;
  });
  it('checks page addresses, tester addresses and times', () => {
    expect(pageProblem('/domains')).toBeNull();
    expect(pageProblem('domains')).not.toBeNull();
    expect(pageProblem('/admin/x')).not.toBeNull();
    expect(pageProblem('/signin')).not.toBeNull();
    expect(pageProblem('/')).not.toBeNull();
    expect(ipsProblem(['203.0.113.7', '2001:db8::1'])).toBeNull();
    expect(ipsProblem(['999.1.1.1'])).not.toBeNull();
    const f = maintenanceForm.parse({ enabled: 'on', startAt: '2026-11-09 14:00', endAt: '', bannerMinutes: '30' });
    expect(f).toMatchObject({ enabled: true, startAt: Date.parse('2026-11-09T14:00:00Z'), endAt: null, bannerMinutes: 30 });
    expect(maintenanceForm.safeParse({ enabled: 'on', startAt: 'tomorrow' }).success).toBe(false);
  });
  it('the notice page is glass, escaped and a 503 from the proxy', () => {
    const html = maintenanceHtml(fromPage(page('/domains', { message: '<b>x</b>' })));
    expect(html).toMatch(/backdrop-filter/);
    expect(html).not.toMatch(/<b>x<\/b>/);
    const proxy = readFileSync('proxy.ts', 'utf8');
    expect(proxy).toMatch(/maintenancePageResponse\(closed\.closure\)/);
  });
});
