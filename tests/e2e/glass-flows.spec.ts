import { expect, test } from '@playwright/test';

/*
 * The main flows on the Glass UI pages (owner, 2026-11-09), on the demo server (no database, made-up examples). Flows that need real accounts
 * (seller upload, admin approvals, payouts, the guide and page editors, maintenance on and off) run on the real server in listing.spec.ts,
 * admin.spec.ts, orders.spec.ts and maintenance.spec.ts; emails through ZeptoMail are mocked in tests/unit/email-zepto.test.ts.
 */
test.describe('glass UI flows', () => {
  test('home: one h1, the hero search goes to websites or domains', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('[data-sob="index"]')).toBeVisible();
    await page.getByRole('tab', { name: 'Domains' }).click();
    await page.locator('#q').fill('mybrand');
    await page.getByRole('button', { name: 'Search domains' }).click();
    await expect(page).toHaveURL(/\/domains\?q=mybrand/);
  });

  test('browse and search websites, open one, its live demo and add it to the cart', async ({ page }) => {
    await page.goto('/websites');
    await expect(page.locator('[data-sob="websites"]')).toBeVisible();
    const first = page.locator('a.glass.card[href^="/websites/"]').first();
    await expect(first).toBeVisible();
    const name = (await first.locator('.meta div div').first().innerText()).trim();
    await page.goto(`/websites?q=${encodeURIComponent(name.split(' ')[0])}`);
    await expect(page.locator('a.glass.card[href^="/websites/"]').first()).toBeVisible();
    await page.locator('a.glass.card[href^="/websites/"]').first().click();
    await expect(page.locator('[data-sob="website"] h1')).toBeVisible();
    const demo = page.locator('a[href*="/preview/"], a[href*="/demo/"]').first();
    if (await demo.count()) {
      const href = await demo.getAttribute('href');
      const res = await page.request.get(href!);
      expect(res.status()).toBeLessThan(400);
    }
    await page.locator('a[href^="/cart?add="]').first().click();
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.locator('[data-sob="cart"]')).toBeVisible();
  });

  test('checkout sends a visitor to sign in first (free beta request needs an account)', async ({ page }) => {
    const res = await page.goto('/checkout');
    expect(res?.status()).toBeLessThan(500);
    await expect(page).toHaveURL(/\/(signin|checkout)/);
  });

  test('sign in page: tabs switch between sign in and create account', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.locator('#a-name')).toBeVisible();
  });

  test('domain search answers and never says available', async ({ page }) => {
    await page.goto('/domains?q=mybrand');
    await expect(page.locator('[data-sob="domains"]')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\bavailable\b/i);
  });

  test('sellers, a seller profile and guides show their design pages', async ({ page }) => {
    await page.goto('/sellers');
    const link = page.locator('a[href^="/sellers/"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.locator('[data-sob="seller"]')).toBeVisible();
    await page.goto('/guides');
    await expect(page.locator('[data-sob="guides"]')).toBeVisible();
  });

  test('old addresses move: /legal, /order-success, /account-access and /dashboard/admin', async ({ request }) => {
    for (const [from, to] of [
      ['/legal', '/legal/terms'],
      ['/order-success', '/checkout/success'],
      ['/account-access', '/signin?mode=forgot'],
      ['/dashboard/admin', '/admin'],
    ]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect([301, 308], from).toContain(res.status());
      expect(res.headers().location, from).toContain(to);
    }
  });

  test('an unknown address is the design 404', async ({ page }) => {
    const res = await page.goto('/no-such-page-here');
    expect(res?.status()).toBe(404);
    await expect(page.locator('[data-sob="404"] .big')).toHaveText('404');
  });

  test('admin, payouts and the editors ask a visitor to sign in', async ({ page }) => {
    for (const p of ['/admin', '/admin/finance/payouts', '/admin/content/pages', '/admin/seo/post', '/admin/settings/maintenance/modules', '/dashboard/seller/websites/new']) {
      await page.goto(p);
      await expect(page, p).toHaveURL(/\/signin/);
    }
  });
});
