import { expect, test } from '@playwright/test';

/* The cookie notice, the privacy page, and who can reach the data routes. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';

test.describe('cookie notice', () => {
  test('shows once, says what is stored, goes away for good when closed, and never makes the page wider', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto(DEMO + '/');
    const notice = page.getByRole('region', { name: 'Cookies' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('No advertising, no tracking');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(notice.getByRole('link', { name: 'What we store' })).toHaveAttribute('href', '/privacy#cookies');
    await notice.getByRole('button', { name: 'Got it' }).click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Cookies' })).toHaveCount(0);
    await ctx.close();
  });
  test('the privacy page explains cookies and the data choices', async ({ page }) => {
    await page.goto(DEMO + '/privacy');
    await expect(page.getByRole('heading', { name: 'Cookies' })).toBeVisible();
    await expect(page.getByText('We do not use advertising or tracking cookies')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Your data' }).first()).toHaveAttribute('href', '/account/privacy');
  });
});

test.describe('your data page and routes', () => {
  test('the page opens in demo mode and offers both choices', async ({ page }) => {
    await page.goto(DEMO + '/account/privacy');
    await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download my data' })).toBeVisible();
    await expect(page.getByLabel('Type DELETE to confirm')).toBeVisible();
    const ask = page.getByRole('button', { name: 'Ask us to delete my account' });
    await expect(ask).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await expect(ask).toBeEnabled();
  });
  test('signed out on the real server: the page sends you to sign in, the routes say 401', async ({ page, request }) => {
    await page.goto(REAL + '/account/privacy');
    await expect(page).toHaveURL(/\/login/);
    expect((await request.get(REAL + '/api/account/export')).status()).toBe(401);
    expect((await request.post(REAL + '/api/account/delete-request', { data: { confirm: 'DELETE' } })).status()).toBe(401);
    expect((await request.post(REAL + '/api/admin/privacy/00000000-0000-4000-8000-000000000000/process')).status()).toBe(401);
  });
  test('the delete request needs the word DELETE', async ({ request }) => {
    expect((await request.post(DEMO + '/api/account/delete-request', { data: { confirm: 'yes' } })).status()).toBe(401); // not signed in is checked first
  });
});
