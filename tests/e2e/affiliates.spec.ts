import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Admin › Affiliate Management (owner, 2026-11-12), on the demo build without a database (DEMO_URL): the program starts off and its public page is
 * a 404, the switch opens and closes it at once, rate edits show without a redeploy, and the program is switched off again at the end.
 */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const api = (r: APIRequestContext, data: object) => r.post(`${DEMO}/api/admin/affiliates`, { data, headers: { origin: DEMO } });

test.describe('Affiliate Management', () => {
  test.afterAll(async ({ request }) => {
    await api(request, { action: 'settings', settings: { enabled: false } });
  });

  test('the program starts off; the admin page shows its twelve sections', async ({ page, request }) => {
    expect((await request.get(`${DEMO}/affiliates`)).status()).toBe(404);
    await page.goto(`${DEMO}/admin/affiliates`);
    await expect(page.getByRole('heading', { name: 'Affiliate Management' })).toBeVisible();
    await expect(page.getByText('Program off')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Affiliate Management' }).getByRole('link')).toHaveCount(12);
    await page.getByRole('link', { name: 'Commission', exact: true }).click();
    await expect(page).toHaveURL(/tab=commission/);
    await expect(page.getByLabel('First website purchase rate')).toHaveValue('15');
  });

  test('the switch opens the public page with the saved rates, and closes it again', async ({ request }) => {
    const on = await api(request, { action: 'settings', settings: { enabled: true, intro: 'Test affiliate intro', rates: { first_purchase: 2000 } } });
    expect(on.status(), await on.text()).toBe(200);
    const page = await request.get(`${DEMO}/affiliates`);
    expect(page.status()).toBe(200);
    const html = await page.text();
    expect(html).toContain('Test affiliate intro');
    expect(html).toContain('20%');
    expect(html).toContain('Affiliate Program');
    expect((await api(request, { action: 'settings', settings: { enabled: false } })).status()).toBe(200);
    expect((await request.get(`${DEMO}/affiliates`)).status()).toBe(404);
  });

  test('the public page and the admin page fit a phone and a desktop', async ({ page, request }) => {
    await api(request, { action: 'settings', settings: { enabled: true } });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/affiliates', '/admin/affiliates?tab=commission']) {
        await page.goto(`${DEMO}${path}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
    await page.goto(`${DEMO}/affiliates`);
    await expect(page.getByRole('link', { name: 'Join the affiliate program' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Affiliate terms' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /top 5/i })).toBeVisible();
    await api(request, { action: 'settings', settings: { enabled: false } });
  });

  test('a click is refused while the program is off', async ({ request }) => {
    const r = await request.post(`${DEMO}/api/affiliates/click`, { data: { code: 'AFFTEST1', product: '', consent: true }, headers: { origin: DEMO } });
    expect(r.headers()['set-cookie'] ?? '').not.toContain('sob_ref');
  });
});
