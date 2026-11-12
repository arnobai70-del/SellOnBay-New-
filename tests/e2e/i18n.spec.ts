import { expect, test, type APIRequestContext } from '@playwright/test';

/*
 * Languages (owner, 2026-11-12) on the demo build (DEMO_URL): English only until an admin publishes another language; then /bn/… and /ar/…
 * pages in that language (lang, dir, hreflang, canonical), the switcher, the saved choice, the dashboards' menus, the admin's edit and publish,
 * and unpublishing again. Every language is put back to a draft at the end.
 */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const BUILTIN = ['en', 'bn', 'ar', 'hi', 'es', 'fr', 'de', 'pt'];
const PERSON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const languages = (published: string[]) => BUILTIN.map((code, order) => ({ code, enabled: true, published: code === 'en' || published.includes(code), order, dir: code === 'ar' ? 'rtl' : 'ltr' }));
const setLive = (r: APIRequestContext, published: string[]) =>
  r.post(`${DEMO}/api/admin/languages`, { data: { action: 'languages', settings: { defaultLang: 'en', languages: languages(published) } }, headers: { origin: DEMO } });

test.describe.configure({ mode: 'serial' });
test.use({ userAgent: PERSON_UA });
test.describe('Languages', () => {
  test.afterAll(async ({ request }) => {
    await setLive(request, []);
  });

  test('English only by default: no language choice, and the other addresses do not exist', async ({ page, request }) => {
    await setLive(request, []);
    await page.goto(`${DEMO}/websites`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Language')).toHaveCount(0);
    expect((await request.get(`${DEMO}/bn/websites`)).status()).toBe(404); // a draft language is never shown
    expect(await page.locator('link[rel="alternate"][hreflang]').count()).toBe(0);
  });

  test('published Bengali and Arabic: own addresses, words, lang, dir, hreflang and canonical', async ({ page, request }) => {
    expect((await setLive(request, ['bn', 'ar'])).status()).toBe(200);
    await page.goto(`${DEMO}/bn`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const nav = page.getByRole('navigation', { name: 'প্রধান' }); // the menu's label is translated too ("Main")
    await expect(nav.getByRole('link', { name: 'ওয়েবসাইট' })).toHaveAttribute('href', '/bn/websites');
    await expect(nav.getByRole('link', { name: 'অ্যাফিলিয়েট' })).toHaveAttribute('href', '/bn/affiliates');
    await expect(page.getByText('ওয়েবসাইট কিনুন। ডোমেইন নিন। অথবা নিজেরটা বিক্রি করুন।')).toBeVisible(); // the home page words
    await page.goto(`${DEMO}/bn/help`);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(/\/bn\/help$/);
    const alts = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => [e.getAttribute('hreflang'), e.getAttribute('href')]));
    expect(alts.map(([h]) => h).sort()).toEqual(['ar', 'bn', 'en', 'x-default']);
    expect(alts.find(([h]) => h === 'x-default')?.[1]).toMatch(/\/help$/);
    await page.goto(`${DEMO}/ar/websites`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    expect((await request.get(`${DEMO}/en/websites`, { maxRedirects: 0 })).status()).toBe(308); // English has one address
    expect((await request.get(`${DEMO}/hi/websites`)).status()).toBe(404); // Hindi is still a draft
  });

  test('the switcher opens the same page in the language, and the choice is kept on the next pages and the dashboards', async ({ page }) => {
    await page.goto(`${DEMO}/websites`);
    await page.locator('#lang-top').selectOption('bn');
    await expect(page).toHaveURL(/\/bn\/websites$/);
    await page.goto(`${DEMO}/help`);
    await expect(page).toHaveURL(/\/bn\/help$/); // the saved choice
    await page.goto(`${DEMO}/dashboard/buyer`);
    await expect(page.locator('.side').getByText('সারসংক্ষেপ')).toBeVisible(); // "Overview"
    await page.goto(`${DEMO}/bn/websites`);
    await page.locator('#lang-top').selectOption('en');
    await expect(page).toHaveURL(/\/websites$/);
    await page.goto(`${DEMO}/help`);
    await expect(page).toHaveURL(/\/help$/);
  });

  test('Admin › Language Management: all tabs open; an edited word is shown only after publishing', async ({ page }) => {
    for (const [tab, words] of [
      ['languages', /Add a language/],
      ['translations', /Keep every/],
      ['products', /words/],
      ['seo', /words/],
      ['missing', /Missing \(English shown\)/],
    ] as const) {
      await page.goto(`${DEMO}/admin/languages?tab=${tab}&lang=bn`);
      await expect(page.getByText(words).first(), tab).toBeVisible();
    }
    const word = `ঝুড়ি ${Date.now() % 100000}`; // unique per run: the same word again would be no change
    await page.goto(`${DEMO}/admin/languages?tab=translations&lang=bn&area=nav.&q=nav.cart`);
    await page.getByLabel('nav.cart in bn').first().fill(word);
    await page.getByRole('button', { name: /Save draft/ }).click();
    await expect(page.getByText(/Saved 1 as a draft/)).toBeVisible();
    await page.goto(`${DEMO}/bn/websites`);
    await expect(page.getByRole('navigation', { name: 'প্রধান' }).getByText(word)).toHaveCount(0);
    await page.goto(`${DEMO}/admin/languages?tab=translations&lang=bn&area=nav.&q=nav.cart`);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Publish draft' }).click();
    await expect(page.getByText('Published.', { exact: true })).toBeVisible();
    await page.goto(`${DEMO}/bn/websites`);
    await expect(page.getByRole('navigation', { name: 'প্রধান' }).getByText(word)).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.goto(`${DEMO}/admin/languages?tab=translations&lang=bn`);
    await page.getByRole('button', { name: 'Unpublish edits' }).click();
    await expect(page.getByText('Unpublished.', { exact: true })).toBeVisible();
  });

  test('Arabic fits a phone and a desktop without sideways scrolling', async ({ page }) => {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/ar', '/ar/websites', '/ar/affiliates', '/ar/help']) {
        await page.goto(`${DEMO}${path}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
  });

  test('unpublishing a language closes its addresses at once', async ({ request }) => {
    expect((await setLive(request, [])).status()).toBe(200);
    expect((await request.get(`${DEMO}/bn/websites`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/ar`)).status()).toBe(404);
  });
});
