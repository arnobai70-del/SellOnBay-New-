import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Admin › Subscription Management (owner, 2026-11-12), on the demo build without a database (DEMO_URL): both systems start off, each switch works
 * on its own, plan edits show at once without a redeploy, and both are switched off again at the end.
 */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const buyerApi = (r: APIRequestContext, data: object) => r.post(`${DEMO}/api/admin/buyer-subscriptions`, { data, headers: { origin: DEMO } });
const sellerApi = (r: APIRequestContext, data: object) => r.post(`${DEMO}/api/admin/seller-plans`, { data, headers: { origin: DEMO } });
const OFF_DISPLAY = { free: { visible: true }, pro: { visible: true }, business: { visible: true } };

test.describe('Subscription Management', () => {
  test.afterAll(async ({ request }) => {
    await buyerApi(request, { action: 'settings', enabled: false, intro: '', faq: [] });
    await sellerApi(request, { action: 'settings', enabled: false, display: OFF_DISPLAY });
  });

  test('both systems start off; the pricing page is hidden while buyer subscriptions are off', async ({ page, request }) => {
    expect((await request.get(`${DEMO}/subscriptions`)).status()).toBe(404);
    await page.goto(`${DEMO}/admin/subscriptions`);
    await expect(page.getByRole('heading', { name: 'Subscription Management' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Buyer subscriptions' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Seller subscriptions' }).click();
    await expect(page).toHaveURL(/tab=seller/);
    await expect(page.getByText('no new requests')).toBeVisible();
  });

  test('the buyer switch opens and closes the pricing page at once', async ({ request }) => {
    expect((await buyerApi(request, { action: 'settings', enabled: true, intro: 'Test intro', faq: [] })).status()).toBe(200);
    const open = await request.get(`${DEMO}/subscriptions`);
    expect(open.status()).toBe(200);
    expect(await open.text()).toContain('Test intro');
    expect((await buyerApi(request, { action: 'settings', enabled: false, intro: '', faq: [] })).status()).toBe(200);
    expect((await request.get(`${DEMO}/subscriptions`)).status()).toBe(404);
  });

  test('a buyer plan edit (price, websites, benefits) shows on the pricing page without a redeploy', async ({ request }) => {
    await buyerApi(request, { action: 'settings', enabled: true, intro: '', faq: [] });
    const id = '00000000-0000-4000-8000-000000000001';
    const r = await buyerApi(request, {
      action: 'savePlan',
      id,
      plan: {
        key: 'pro',
        name: 'Pro',
        priceCents: 15900,
        renewalCents: 8900,
        period: 'year',
        websiteLimit: 4,
        supportDays: 365,
        benefits: [{ text: 'Priority email support', on: true }],
        features: { source_code: true },
        color: '#5FA88F',
      },
    });
    expect(r.status(), await r.text()).toBe(200);
    const html = await (await request.get(`${DEMO}/subscriptions`)).text();
    expect(html).toContain('$159');
    expect(html).toContain('Priority email support');
    expect(html).toMatch(/4(<!-- -->)? (<!-- -->)?websites/); // React separates the number and the word with a marker in the HTML
    expect((await buyerApi(request, { action: 'savePlan', id, plan: { key: 'Bad Key' } })).status()).toBe(400);
  });

  test('a seller plan edit is saved as a new version; withdraw and offer again; the seller switch saves', async ({ page, request }) => {
    const v = await sellerApi(request, { action: 'saveVersion', code: 'pro', name: 'Pro', monthlyCents: 2900, yearlyCents: 29000, commissionBps: 900, listingLimit: 40, featured: true });
    expect(v.status(), await v.text()).toBe(200);
    expect(((await v.json()) as { value: { version: number } }).value.version).toBeGreaterThan(1);
    expect((await sellerApi(request, { action: 'offer', code: 'free', offered: false })).status()).toBe(409); // Free cannot be withdrawn
    expect((await sellerApi(request, { action: 'offer', code: 'business', offered: false })).status()).toBe(200);
    expect((await sellerApi(request, { action: 'settings', enabled: true, display: OFF_DISPLAY })).status()).toBe(200);
    await page.goto(`${DEMO}/admin/subscriptions?tab=seller`);
    await expect(page.getByText('9% commission')).toBeVisible();
    await expect(page.getByText('sellers can ask for a plan')).toBeVisible();
    expect((await sellerApi(request, { action: 'saveVersion', code: 'pro', name: 'Pro', monthlyCents: 1, yearlyCents: 1, commissionBps: 20000, listingLimit: 1 })).status()).toBe(400);
  });
});
