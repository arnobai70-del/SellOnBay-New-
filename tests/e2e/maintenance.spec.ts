import { expect, test, type APIRequestContext } from '@playwright/test';

/* Module maintenance (lib/maintenance), demo mode: one module closes, the rest keeps working, and it opens again. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const set = (request: APIRequestContext, data: object) => request.post(`${DEMO}/api/admin/maintenance`, { data, headers: { origin: DEMO } });

test.describe('module maintenance (demo mode)', () => {
  test.afterEach(async ({ request }) => {
    for (const key of ['seller', 'checkout', 'seo', 'ai']) await set(request, { module: key, enabled: false, message: '' });
  });

  test('seller maintenance closes the seller side only; buyers and visitors carry on', async ({ page, request }) => {
    const on = await set(request, { module: 'seller', enabled: true, message: 'Seller tools are being updated. Back at 14:00.' });
    expect(on.status(), await on.text()).toBe(200);

    const seller = await page.goto(`${DEMO}/dashboard/seller`);
    expect(seller?.status()).toBe(503);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seller dashboard: back soon');
    await expect(page.getByText('Seller tools are being updated. Back at 14:00.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/seller$/); // the address stays

    for (const open of ['/dashboard/buyer', '/browse', '/product/saffron-table', '/']) expect((await request.get(`${DEMO}${open}`)).status(), open).toBe(200);

    const api = await request.post(`${DEMO}/api/seller/payout`, { data: {}, headers: { origin: DEMO } });
    expect(api.status()).toBe(503);
    expect(api.headers()['retry-after']).toBe('300');
    expect((await api.json()).maintenance.module).toBe('seller');
    expect((await request.get(`${DEMO}/api/health`)).status()).toBe(200);

    const state = await (await request.get(`${DEMO}/api/admin/maintenance`)).json();
    expect(state.modules.find((m: { key: string }) => m.key === 'seller').active).toBe(true);
    expect(state.history[0]).toMatchObject({ key: 'seller', enabled: true });

    await set(request, { module: 'seller', enabled: false, message: '' });
    expect((await request.get(`${DEMO}/dashboard/seller`)).status()).toBe(200);
  });

  test('payment maintenance stops new orders but not browsing; a planned window waits for its start', async ({ request }) => {
    const end = new Date(Date.now() + 20 * 60_000).toISOString();
    expect((await set(request, { module: 'checkout', enabled: true, message: '', endAt: end })).status()).toBe(200);
    const order = await request.post(`${DEMO}/api/demo/orders`, { data: { productId: 'saffron-table', pkg: 'asis' }, headers: { origin: DEMO } });
    expect(order.status()).toBe(503);
    expect(Number(order.headers()['retry-after'])).toBeGreaterThan(1100);
    expect((await request.get(`${DEMO}/browse?q=shop`)).status()).toBe(200);
    expect((await request.get(`${DEMO}/api/domains?name=example`)).status()).toBe(200);

    // planned for later: not closed yet
    const later = new Date(Date.now() + 60 * 60_000).toISOString();
    expect((await set(request, { module: 'checkout', enabled: true, message: '', startAt: later })).status()).toBe(200);
    expect((await request.get(`${DEMO}/checkout?id=saffron-table`)).status()).toBe(200);
  });

  test('SEO maintenance closes the blog, never the public site; bad input is refused', async ({ request }) => {
    expect((await set(request, { module: 'seo', enabled: true, message: '' })).status()).toBe(200);
    expect((await request.get(`${DEMO}/blog`)).status()).toBe(503);
    expect((await request.get(`${DEMO}/apps/digital`)).status()).toBe(200);
    expect((await set(request, { module: 'nope', enabled: true })).status()).toBe(400);
    expect((await set(request, { module: 'seo', enabled: true, message: '<script>' })).status()).toBe(400);
    const now = Date.now();
    expect((await set(request, { module: 'seo', enabled: true, startAt: new Date(now + 60_000).toISOString(), endAt: new Date(now).toISOString() })).status()).toBe(400);
  });

  test('the Maintenance Manager closes and reopens a module, shows its state and history, and fits a phone', async ({ page }) => {
    await page.goto(`${DEMO}/dashboard/admin/maintenance`);
    await expect(page.getByRole('heading', { name: 'Every part of the site is open' })).toBeVisible();
    const card = page.locator('#module-ai');
    await card.getByLabel('Under maintenance').check();
    await card.getByLabel(/Message visitors see/).fill('The idea tool gets a new model today.');
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByRole('status')).toContainText('now in maintenance');
    await expect(page.getByRole('heading', { name: 'In maintenance now: AI tools' })).toBeVisible();
    await expect(card.locator('.chip')).toHaveText('In maintenance');
    await expect(page.getByText('AI tools: maintenance on').first()).toBeVisible();

    const tool = await page.request.get(`${DEMO}/tools/site-ideas`);
    expect(tool.status()).toBe(503);
    expect(await tool.text()).toContain('The idea tool gets a new model today.');

    await card.getByLabel('Under maintenance').uncheck();
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByRole('status')).toContainText('open again');
    await expect(card.locator('.chip')).toHaveText('Open');
    expect((await page.request.get(`${DEMO}/tools/site-ideas`)).status()).toBe(200);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${DEMO}/dashboard/admin/maintenance`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
