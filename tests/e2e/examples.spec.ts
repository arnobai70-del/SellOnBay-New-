import { expect, test } from '@playwright/test';
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

/* The made-up starter listings and developers are marked as examples and show no made-up ratings, sales or reviews. */
test('starter listings and developers say Example and show no made-up numbers', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  await expect(page.locator('.ex-grid .ex-eg').first()).toHaveText('Example');
  await expect(page.locator('.ex-grid')).not.toContainText('★');
  await page.goto(`${DEMO}/product/bioboard`);
  await expect(page.locator('[data-pdp] [data-example]')).toHaveText('Example listing');
  await expect(page.locator('.pd-meta')).toContainText('No reviews yet');
  await expect(page.locator('.pd-meta')).not.toContainText('sold');
  await page.goto(`${DEMO}/developers`);
  await expect(page.locator('.dv-eg').first()).toHaveText('Example profile');
});
