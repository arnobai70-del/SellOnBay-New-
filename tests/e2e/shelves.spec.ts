import { expect, test } from '@playwright/test';

/* The shelves in the marketplace layout: breadcrumb, title, category chips, the guide underneath, and the top-bar search reaching a shelf you are already on. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

test('a shelf opens with a breadcrumb, one h1 and category chips that filter the list', async ({ page }) => {
  await page.goto(`${DEMO}/browse`);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Home');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ready-made websites');
  const chips = page.getByRole('group', { name: 'Categories' });
  await chips.getByRole('button', { name: /^Tools/ }).click();
  await expect(chips.getByRole('button', { name: /^Tools/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/cat=Tools/);
  await expect(page.locator('.bl-bar')).toContainText('3 sites of 12');
});

test('the top-bar search on the shelf you are on shows the new results', async ({ page }) => {
  await page.goto(`${DEMO}/browse?q=restaurant`);
  await expect(page.locator('.mk-shelfsearch input')).toHaveValue('restaurant');
  await page.locator('#mk-q').fill('clinic');
  await page.locator('.mk-search').getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/q=clinic/);
  await expect(page.locator('.mk-shelfsearch input')).toHaveValue('clinic');
  await expect(page.locator('.bl-grid')).toContainText('Clinic Desk');
});

test('every shelf ends with a guide and searches on the other shelves', async ({ page }) => {
  await page.goto(`${DEMO}/apps/ios`);
  const guide = page.locator('.mk-guide');
  await expect(guide.getByRole('heading', { level: 2 })).toHaveText('About iPhone & iPad apps');
  await expect(guide).toContainText('48 hours to check it');
  const related = guide.getByRole('navigation', { name: 'Searches on other shelves' });
  await expect(related.getByRole('link', { name: 'restaurant websites' })).toHaveAttribute('href', '/browse?q=restaurant');
  await expect(related.getByRole('link', { name: /iPhone/ })).toHaveCount(0);
});

test('on a phone the shelf stays inside the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of ['/browse', '/apps/android', '/apps/digital']) {
    await page.goto(`${DEMO}${path}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});

test('lists show no prices, and the price appears on the product page beside Buy', async ({ page }) => {
  await page.goto(`${DEMO}/browse?min=10&max=20&sort=low`);
  const grid = page.locator('.bl-grid');
  await expect(grid.locator('.tall').first()).toBeVisible();
  expect(await grid.innerText()).not.toMatch(/\$\d/);
  await expect(page.getByRole('option', { name: /^Price/ })).toHaveCount(0);
  await expect(page.getByText('Lowest price')).toHaveCount(0);
  await expect(page).toHaveURL(/\/browse$/); // price filters from an old link are dropped
  await page.goto(`${DEMO}/`);
  expect(await page.locator('.ex-grid').innerText()).not.toMatch(/\$\d/);
  await page.locator('.ex-grid .ex-card-in').first().click();
  await expect(page.locator('.buybox .price')).toHaveText(/^\$\d/);
});
