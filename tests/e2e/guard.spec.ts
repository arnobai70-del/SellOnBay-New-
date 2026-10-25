import { expect, test } from '@playwright/test';

/* Abuse hardening on the running app: one connection cannot create orders without end, other connections are not affected, and the device cookie is set. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
const site = { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' };
const from = (ip: string) => ({ 'x-forwarded-for': ip });

test.describe('abuse hardening', () => {
  test('a connection that creates too many orders is refused, another connection is not', async ({ request }) => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    const other = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const codes: number[] = [];
    for (let i = 0; i < 32; i++) codes.push((await request.post(`${DEMO}/api/demo/orders`, { data: site, headers: from(ip) })).status());
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes.slice(30)).toEqual([429, 429]);
    const refused = await request.post(`${DEMO}/api/demo/orders`, { data: site, headers: from(ip) });
    expect((await refused.json()).error).toMatch(/fast|later/i);
    expect((await request.post(`${DEMO}/api/demo/orders`, { data: site, headers: from(other) })).status()).toBe(200);
  });

  test('every visitor gets a device cookie that scripts cannot read', async ({ request }) => {
    const res = await request.get(`${DEMO}/browse`);
    const cookie = res.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('lb_dev='));
    expect(cookie?.value).toMatch(/HttpOnly/i);
    expect(cookie?.value).toMatch(/SameSite=lax/i);
  });

  test('the security and risk pages are for admins only', async ({ page }) => {
    await page.goto(`${REAL}/dashboard/admin/security`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Shared connections and devices')).toHaveCount(0);
    await page.goto(`${REAL}/dashboard/admin/risk`);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Emergency switch')).toHaveCount(0);
  });
  test('the admin risk routes refuse a visitor', async ({ request }) => {
    for (const [url, data] of [
      ['/api/admin/risk/switch', { key: 'pause_new_buyer_checkout', state: 'on', reason: 'Trying it out.' }],
      ['/api/admin/risk/clean', { what: 'review', id: 'x', note: 'Trying it out.' }],
      ['/api/admin/risk/holds/11111111-1111-4111-8111-111111111111/decide', { decision: 'release', note: 'Trying it out.' }],
    ] as const)
      expect([401, 403, 404]).toContain((await request.post(`${REAL}${url}`, { data })).status());
  });
});

test.describe('new versions', () => {
  test('the publish and decide routes refuse a visitor, and the admin page needs an admin', async ({ request, page }) => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect([401, 403, 404]).toContain(
      (await request.post(`${REAL}/api/listings/some-product/versions`, { data: { version: '1.1', changelog: 'Fixes a bug in login.', fileUrl: 'https://example.com/a.zip' } })).status(),
    );
    expect([401, 403, 404]).toContain((await request.post(`${REAL}/api/admin/versions/${id}/decide`, { data: { decision: 'approve', filesChecked: true } })).status());
    await page.goto(`${REAL}/dashboard/admin/versions`);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('repository access routes', () => {
  test('are refused to a visitor, and the checklist page needs an admin', async ({ request, page }) => {
    const id = '11111111-1111-4111-8111-111111111111';
    for (const [url, data] of [
      [`/api/orders/${id}/resend-invite`, {}],
      [`/api/orders/${id}/revoke-done`, {}],
      [`/api/admin/repo/${id}`, { action: 'confirm', note: 'Trying it out.' }],
    ] as const)
      expect([401, 403, 404]).toContain((await request.post(`${REAL}${url}`, { data })).status());
    await page.goto(`${REAL}/dashboard/admin/repo`);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('settings', () => {
  test('the route refuses a visitor, and the page needs an admin', async ({ request, page }) => {
    expect([401, 403, 404]).toContain((await request.post(`${REAL}/api/admin/settings`, { data: { priceMaxCents: 100000, reason: 'Trying it out.' } })).status());
    await page.goto(`${REAL}/dashboard/admin/settings`);
    await expect(page).toHaveURL(/\/login/);
  });
  test('the launch check page needs an admin', async ({ page }) => {
    await page.goto(`${REAL}/dashboard/admin/launch`);
    await expect(page).toHaveURL(/\/login/);
  });
});
