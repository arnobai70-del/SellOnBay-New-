import { expect, test } from '@playwright/test';

/* The site search: results show while typing, and a word found deep in a page's text finds that page. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
test.use({ viewport: { width: 1366, height: 800 } });

test('typing shows results at once, and Enter opens every result', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  await page.locator('#mk-q').fill('refund');
  const hits = page.locator('.mk-hits');
  await expect(hits).toBeVisible();
  await expect(hits.locator('a[href^="/refunds"]').first()).toBeVisible();
  await page.locator('#mk-q').press('Enter');
  await expect(page).toHaveURL(/\/search\?.*q=refund/);
  await expect(page.locator('h1')).toContainText('refund');
  await expect(page.locator('.ss-hit').first()).toBeVisible();
});

test('a word from inside a page finds that page', async ({ request }) => {
  const res = await request.get(`${DEMO}/api/search?q=dispute`);
  expect(res.ok()).toBeTruthy();
  const { hits } = (await res.json()) as { hits: { kind: string; href: string }[] };
  expect(hits.some((h) => h.kind === 'page' && h.href.startsWith('/refunds'))).toBeTruthy();
});
