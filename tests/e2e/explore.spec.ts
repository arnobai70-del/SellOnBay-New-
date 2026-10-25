import { expect, test } from '@playwright/test';

/* The home page in the marketplace layout. Real products only, no brand logos, no claims we cannot keep. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

test('has one h1, the domain finder, featured products that open, and tabs that reorder', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('.ex-grid .ex-card').first()).toBeVisible();
  const popular = await page.locator('.ex-grid .ex-name').allTextContents();
  await page.getByRole('tab', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/tab=new/);
  await expect(page.getByRole('tab', { name: 'New', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('.ex-grid .ex-name').allTextContents()).not.toEqual(popular);
  await page.locator('.ex-grid .ex-card-in').first().click();
  await expect(page).toHaveURL(/\/product\//);
});

test('does not promise what we do not have, and states the fees from the config', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  const text = await page.locator('main').innerText();
  for (const bad of [/24\/7/i, /instant delivery/i, /50% off/i, /minutes/i, /envato/i, /unlimited downloads/i]) expect(text).not.toMatch(bad);
  await expect(page.locator('.mk-hero-points')).toContainText('Payment held in escrow until you accept');
  await expect(page.locator('.mk-sellband')).toContainText('78% of every sale from $20 and 70% below it');
});

test('the hero domain box opens the domain search with the name', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  await expect(page.locator('.mk-find-list li')).toHaveCount(4);
  await page.getByLabel('Find a domain for your site').fill('Sunrise Bakery');
  await page.getByRole('button', { name: 'Find domain' }).click();
  await expect(page).toHaveURL(/\/domains\?q=/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('the popular row and developer row lead to the right shelves', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  await expect(page.locator('.mk-hero-pop a').first()).toHaveAttribute('href', /\?cat=/);
  await expect(page.locator('.mk-svc', { hasText: 'Bug fixes' })).toHaveAttribute('href', '/developers?area=Bug%20fixes');
});

test('on a phone the page stays inside its width and the tab bar does not cover the footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${DEMO}/`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('.mk-find')).toBeVisible();
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  const legal = page.locator('.mk-foot-base');
  const tabs = page.getByRole('navigation', { name: 'Quick links' });
  const l = (await legal.boundingBox())!;
  const t = (await tabs.boundingBox())!;
  expect(l.y + l.height).toBeLessThanOrEqual(t.y + 1);
});

test('the old /explore address goes to the home page, and the globe hero lives on /welcome', async ({ page, request }) => {
  const r = await request.get(`${DEMO}/explore?tab=new`, { maxRedirects: 0 });
  expect([301, 307, 308]).toContain(r.status());
  expect(r.headers().location).toContain('/?tab=new');
  await page.goto(`${DEMO}/welcome`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Pick a site');
  await expect(page.locator('header.mk-hdr')).toBeVisible();
  await page.goto(`${DEMO}/`);
  await page.locator('.mk-foot').getByRole('link', { name: 'About SellOnBay' }).click();
  await expect(page).toHaveURL(`${DEMO}/welcome`);
});

test('sections below the screen rise in as you scroll, and nothing is ever left hidden', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(`${DEMO}/`);
  await expect(page.locator('.mk-hero h1')).toHaveCSS('opacity', '1'); // the hero words finish arriving
  const steps = page.locator('.mk-steps');
  await expect(steps).toHaveClass(/\brise\b/); // starts below the screen, so it waits
  await expect(steps).not.toHaveClass(/\bin\b/);
  expect(
    await steps
      .locator('li')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity),
  ).toBe('0');
  await steps.scrollIntoViewIfNeeded();
  await expect(steps).toHaveClass(/\bin\b/);
  for (const li of await steps.locator('li').all()) await expect(li).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  // switching tabs after the cards came in keeps the new cards visible
  const grid = page.locator('.ex-grid');
  await grid.scrollIntoViewIfNeeded();
  await expect(grid).toHaveClass(/\bin\b/);
  await page.getByRole('tab', { name: 'Top rated' }).click();
  await expect(page).toHaveURL(/tab=top/);
  for (const c of await grid.locator('.ex-card').all()) await expect(c.locator('xpath=ancestor::div[contains(@class,"tilt")][1]')).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('with reduced motion the home page shows everything at once', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${DEMO}/`);
  await expect(page.locator('.rise')).toHaveCount(0);
  expect(await page.locator('.mk-hero h1').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  for (const li of await page.locator('.mk-steps li').all()) expect(await li.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

test('the all-categories page lists every shelf with counts, and links only categories that have products', async ({ page }) => {
  await page.goto(`${DEMO}/categories`);
  for (const name of ['Websites', 'Android apps', 'AI tools', 'Fonts', 'Templates, plugins and scripts', 'Hire a developer'])
    await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  const web = page.locator('.mk-allcat').first();
  await expect(web).toContainText(/\d+ products/);
  for (const a of await page.locator('.mk-allcat li a:has(span)').all()) {
    const n = await a.locator('span').textContent();
    if (n !== null) expect(Number(n)).toBeGreaterThan(0);
  }
});
