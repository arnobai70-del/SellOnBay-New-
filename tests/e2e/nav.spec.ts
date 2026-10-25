import { expect, test, type Page } from '@playwright/test';

/* The marketplace top bar: a search with a shelf picker, and a category bar whose wide panels open when the mouse arrives. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
test.use({ viewport: { width: 1366, height: 800 } });

const bar = (page: Page) => page.locator('header.mk-hdr');
/* The cookie notice sits over the bottom of the page; close it if it is there (it is not in every run). */
const dismissNotice = async (page: Page) => {
  const got = page.getByRole('button', { name: 'Got it' });
  if (await got.isVisible()) await got.click();
};

test.describe('category bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${DEMO}/browse`);
    await dismissNotice(page);
  });

  test('a panel opens on hover, stays open while the pointer is on it, and closes after it leaves', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Audio menu' });
    const all = bar(page).getByRole('link', { name: 'All audio' });
    await expect(all).toBeHidden();
    await bar(page).locator('.mk-cat', { has: btn }).hover();
    await expect(all).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await all.hover(); // moving down onto the panel must not close it
    await expect(all).toBeVisible();
    await page.mouse.move(700, 700);
    await expect(all).toBeHidden();
  });

  test('moving to another entry switches the panel, and its links go to the topic with the kind picked', async ({ page }) => {
    const entry = (name: string) => bar(page).locator('.mk-cat', { has: page.getByRole('button', { name: `${name} menu`, exact: true }) });
    await entry('Fonts').hover();
    await expect(bar(page).getByRole('link', { name: 'All fonts' })).toBeVisible();
    await entry('AI tools').hover();
    await expect(bar(page).getByRole('link', { name: 'All fonts' })).toBeHidden();
    await bar(page).locator('#mk-panel-ai').getByRole('link', { name: 'AI automations' }).click();
    await expect(page).toHaveURL(/\/apps\/digital\?topic=ai&cat=AI(\+|%20)automations/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI tools');
    await expect(page.locator('.mk-catchips').getByRole('button', { name: /^AI automations/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(bar(page).locator('.mk-cat-link[aria-current]')).toHaveText('AI tools');
  });

  test('a topic with nothing in it yet invites sellers, and removing the topic shows the whole shelf', async ({ page }) => {
    await page.goto(`${DEMO}/apps/digital?topic=fonts`);
    await dismissNotice(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fonts');
    await expect(page.getByText('Nothing in Fonts yet')).toBeVisible();
    await expect(page.locator('.bl-empty').getByRole('link', { name: 'Sell yours here' })).toHaveAttribute('href', '/sell');
    await page.getByRole('button', { name: 'Remove filter Fonts' }).click();
    await expect(page).toHaveURL(/\/apps\/digital$/);
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Fonts');
    await expect(page.locator('.bl-grid .tall').first()).toBeVisible();
  });

  test('the keyboard toggles a panel and Escape closes it', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Web menu' });
    // A key press before the bar has hydrated does nothing, so press again until it opens.
    await expect(async () => {
      await btn.press('Enter');
      await expect(btn).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
    }).toPass();
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  test('the page you are on is marked in the bar', async ({ page }) => {
    await expect(bar(page).locator('.mk-cat-link[aria-current]')).toHaveText('Web');
    await page.goto(`${DEMO}/developers`);
    await expect(bar(page).locator('.mk-cat-link[aria-current]')).toHaveText('Hire a developer');
    await page.goto(`${DEMO}/apps/ios`);
    await expect(bar(page).locator('.mk-cat-link[aria-current]')).toHaveText('Apps');
    await page.goto(`${DEMO}/apps/digital?topic=audio`);
    await expect(bar(page).locator('.mk-cat-link[aria-current]')).toHaveText('Audio');
  });
});

test('the top search goes to the chosen shelf with the words in its search', async ({ page }) => {
  await page.goto(`${DEMO}/`);
  await dismissNotice(page);
  await page.locator('#mk-q').fill('timer');
  await page.locator('#mk-shelf').selectOption('/apps/desktop');
  await page.locator('.mk-search').getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/apps\/desktop\?q=timer/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 } });
  test('the menu sheet lists every entry, the tab bar is there, and the page does not scroll sideways', async ({ page }) => {
    await page.goto(`${DEMO}/browse`);
    await dismissNotice(page);
    const tabs = page.getByRole('navigation', { name: 'Quick links' });
    for (const name of ['Home', 'Categories', 'Saved', 'Sell', 'You']) await expect(tabs.getByRole('link', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const sheet = page.locator('#mk-sheet');
    await expect(sheet).toBeVisible();
    await sheet.locator('summary', { hasText: 'Audio' }).click();
    await expect(sheet.getByRole('link', { name: 'All audio' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await tabs.getByRole('link', { name: 'Categories' }).click();
    await expect(page).toHaveURL(`${DEMO}/categories`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All categories');
  });
});
