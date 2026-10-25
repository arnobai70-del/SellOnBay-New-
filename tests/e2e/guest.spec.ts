import { expect, test } from '@playwright/test';

/* The visitor panel: a basic dashboard for someone who is not signed in. Saved and recently viewed come from this browser only. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

test('the visitor panel shows what was opened and saved, what a visitor can do, and the way to an account', async ({ page }) => {
  await page.goto(`${DEMO}/browse`);
  const first = page.locator('.bl-grid .tall .pcard').first();
  const href = (await first.getAttribute('href'))!;
  await page.goto(`${DEMO}${href}`);
  await page.evaluate((id) => localStorage.setItem('lb:saved', JSON.stringify([id])), href.split('/').pop());
  await page.locator('header.mk-hdr').getByRole('link', { name: 'Your visit' }).click();
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your visit');
  await expect(page.getByRole('heading', { name: 'Saved (1)' })).toBeVisible();
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Recently viewed' }) }).locator(`a[href="${href}"]`)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in or make an account' })).toHaveAttribute('href', '/login');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the visitor panel fits the screen and the tab bar leads to it', async ({ page }) => {
    await page.goto(`${DEMO}/`);
    await page.getByRole('navigation', { name: 'Quick links' }).getByRole('link', { name: 'You' }).click();
    await expect(page).toHaveURL(/\/guest$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
