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

  test('an API error reaches the person in their saved language; English without a choice', async ({ playwright }) => {
    const ask = async (cookie: string) => {
      const ctx = await playwright.request.newContext({ extraHTTPHeaders: { origin: DEMO, ...(cookie ? { cookie } : {}) } });
      const r = await ctx.post(`${DEMO}/api/account/language`, { data: { lang: 'xx' } });
      const body = { status: r.status(), error: ((await r.json()) as { error?: string }).error };
      await ctx.dispose();
      return body;
    };
    expect(await ask('sob_lang=bn')).toEqual({ status: 400, error: 'ওই ভাষা উপলব্ধ নয়।' });
    expect(await ask('')).toEqual({ status: 400, error: 'That language is not available.' });
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
    test.slow(); // five tabs, a save, a publish and an unpublish: more than the usual minute on a busy machine
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

  test('Arabic fits 320, 390, 768, 1280 and 1920 pixels without sideways scrolling', async ({ page }) => {
    test.slow(); // seven pages at five widths
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/ar', '/ar/websites', '/ar/affiliates', '/ar/help', '/ar/legal/terms', '/ar/signin', '/ar/cart']) {
        await page.goto(`${DEMO}${path}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
  });

  test('a visitor whose browser prefers a published language is offered it once; Keep English is remembered', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'bn-BD', userAgent: PERSON_UA });
    const page = await ctx.newPage();
    await page.goto(`${DEMO}/help`);
    const offer = page.locator('[data-lang-suggest="bn"]');
    await expect(offer).toBeVisible();
    await expect(offer).toHaveAttribute('lang', 'bn');
    await expect(page).toHaveURL(/\/help$/); // an offer, never a redirect
    await offer.getByRole('button', { name: 'ইংরেজিতেই থাকুন' }).click(); // "Keep English"
    await expect(offer).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-lang-suggest]')).toHaveCount(0);
    expect((await ctx.cookies()).find((c) => c.name === 'sob_lang')?.value).toBe('en');
    await ctx.close();
  });

  test('every language: its own address, lang, dir, words, canonical, hreflang; legal text stays English with a notice', async ({ page, request }) => {
    test.slow(); // seven languages, two pages each
    const all = BUILTIN.filter((c) => c !== 'en');
    expect((await setLive(request, all)).status()).toBe(200);
    const home = { bn: 'সাহায্য', ar: 'المساعدة', hi: 'मदद', es: 'Ayuda', fr: 'Aide', de: 'Hilfe', pt: 'Ajuda' } as Record<string, string>;
    for (const code of all) {
      await page.goto(`${DEMO}/${code}/help`);
      await expect(page.locator('html'), code).toHaveAttribute('lang', code);
      await expect(page.locator('html'), code).toHaveAttribute('dir', code === 'ar' ? 'rtl' : 'ltr');
      await expect(page.getByRole('link', { name: home[code], exact: true }).first(), code).toBeVisible(); // the menu's Help link
      expect(await page.locator('link[rel="canonical"]').getAttribute('href'), code).toMatch(new RegExp(`/${code}/help$`));
      expect(await page.locator('link[rel="alternate"][hreflang]').count(), code).toBe(BUILTIN.length + 1); // every language and x-default
      await page.goto(`${DEMO}/${code}/legal/terms`);
      await expect(page.locator('[data-legal-notice]'), code).toBeVisible();
      await expect(page.locator('[data-page-text]'), code).toHaveAttribute('lang', 'en');
      if (process.env.I18N_SCREENSHOTS && ['bn', 'ar'].includes(code))
        for (const [w, h] of [
          [390, 844],
          [1280, 900],
        ]) {
          await page.setViewportSize({ width: w, height: h });
          await page.goto(`${DEMO}/${code}`);
          await page.screenshot({ path: `${process.env.I18N_SCREENSHOTS}/${code}-home-${w}.png` });
          await page.setViewportSize({ width: 1280, height: 900 });
        }
    }
    if (process.env.I18N_SCREENSHOTS)
      for (const [w, h] of [
        [390, 844],
        [1280, 900],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`${DEMO}/`);
        await page.screenshot({ path: `${process.env.I18N_SCREENSHOTS}/en-home-${w}.png` });
      }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${DEMO}/legal/terms`);
    await expect(page.locator('[data-legal-notice]')).toHaveCount(0); // English: no notice
  });

  test('unpublishing a language closes its addresses at once', async ({ request }) => {
    expect((await setLive(request, [])).status()).toBe(200);
    expect((await request.get(`${DEMO}/bn/websites`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/ar`)).status()).toBe(404);
  });
});
