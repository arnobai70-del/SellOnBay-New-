import { expect, test } from '@playwright/test';

/* Category pages: real content, structured data, no thin pages, and the sitemap agrees. Demo mode (starter listings only). */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));

test.describe('category pages', () => {
  test('a category with three or more products has its own page, text, cards and structured data', async ({ page, request }) => {
    const html = await (await request.get(`${DEMO}/websites/landing-pages`)).text();
    expect(html).toMatch(/<title>Ready-made landing pages/);
    expect(html).toContain('rel="canonical"');
    const types = ld(html).map((d) => d['@type']);
    expect(types).toEqual(expect.arrayContaining(['BreadcrumbList', 'ItemList', 'FAQPage']));
    expect(ld(html).find((d) => d['@type'] === 'ItemList').itemListElement.length).toBeGreaterThanOrEqual(3);
    await page.goto(`${DEMO}/websites/landing-pages`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/landing pages that turn visitors into sign-ups/);
    expect(await page.locator('a.pcard').count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByRole('heading', { name: 'What to look for' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Filter and compare all landing pages/ })).toHaveAttribute('href', /\/browse\?cat=Landing%20pages/);
  });
  test('a category with fewer than three products has no page; neither does a made-up one or the wrong group', async ({ request }) => {
    expect((await request.get(`${DEMO}/websites/restaurants`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/websites/nope`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/templates/figma-ui-kits`)).status()).toBe(404); // fewer than three today
    expect((await request.get(`${DEMO}/websites/figma-ui-kits`)).status()).toBe(404); // wrong group
  });
  test('the sitemap lists exactly the pages that exist, and the other pages link only to those', async ({ request, page }) => {
    const xml = await (await request.get(`${DEMO}/sitemap.xml`)).text();
    expect(xml).toContain('/websites/landing-pages');
    expect(xml).toContain('/websites/tools');
    expect(xml).not.toContain('/websites/restaurants');
    expect(xml).toContain('/tools/site-ideas');
    await page.goto(`${DEMO}/websites/tools`);
    const links = await page.locator('.prose a[href^="/websites/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(links).toEqual(['/websites/landing-pages']); // only the other category that has a page
  });
});

test.describe('page words an admin rewrites (demo mode)', () => {
  test('rewrite a policy page from its current text, see it live, then go back to the built-in words', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${DEMO}/dashboard/admin/seo/pages`);
    await page.locator('.adm-card', { hasText: 'Refunds' }).getByRole('link', { name: 'Edit page: words and text' }).click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/seo\/pages\/edit\?path=%2Frefunds/);
    await page.getByRole('button', { name: 'Start from the current text' }).click();
    const body = page.getByLabel('Page text');
    await expect(body).toHaveValue(/## How your money is held/);
    await expect(page.locator('.pw-preview h2').first()).toHaveText('How your money is held'); // the preview reads it back
    await page.getByLabel('Page heading').fill('Refunds and disputes');
    await body.fill(`## Our promise\n\nIf it **does not work**, open a [dispute](/refunds).\n\n- Not as described\n- Harmful code`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Saved\. The page shows the new words/)).toBeVisible();

    await page.goto(`${DEMO}/refunds`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refunds and disputes');
    await expect(page.locator('[data-page-text="saved"] h2')).toHaveText('Our promise');
    await expect(page.locator('[data-page-text="saved"] li')).toHaveCount(2);
    await expect(page.getByText('[LAWYER REVIEW]', { exact: false })).toBeVisible(); // the draft stamp stays

    await page.goto(`${DEMO}/dashboard/admin/seo/pages/edit?path=%2Frefunds`);
    await page.getByRole('button', { name: 'Clear all (use the built-in words)' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    await page.goto(`${DEMO}/refunds`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Refunds');
    await expect(page.locator('[data-page-text="built-in"]')).toContainText('How your money is held');
    expect(errors).toEqual([]);
  });

  test('change a heading and intro, and a page built from live parts offers only its meta', async ({ page, request }) => {
    await page.goto(`${DEMO}/dashboard/admin/seo/pages/edit?path=%2Ffind`);
    await page.getByLabel('Page heading').fill('Tell us your trade. We find the site.');
    await page.getByLabel('Intro').fill('Pick one tile and see the matches.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();
    await page.goto(`${DEMO}/find`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tell us your trade. We find the site.');
    await expect(page.locator('.phero .lead')).toHaveText('Pick one tile and see the matches.');
    await page.goto(`${DEMO}/dashboard/admin/seo/pages/edit?path=%2Ffind`);
    await page.getByRole('button', { name: 'Clear all (use the built-in words)' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Saved\./)).toBeVisible();

    await page.goto(`${DEMO}/dashboard/admin/seo/pages/edit?path=%2Fbrowse`);
    await expect(page.getByText('only its meta title and description can be changed here')).toBeVisible();
    await expect(page.getByLabel('Page heading')).toHaveCount(0);
    // the save route refuses junk
    const r = await request.post(`${DEMO}/api/admin/seo/words`, { data: { path: '/find', heading: 'Bad <b>', intro: '', body: '' }, headers: { origin: DEMO } });
    expect(r.status()).toBe(400);
    expect((await request.get(`${DEMO}/dashboard/admin/seo/pages/edit?path=/nope`)).status()).toBe(404);
  });
});

test.describe('search words for listings and topics (demo mode)', () => {
  test('a listing has automatic words, an admin can replace them, and the SEO check lists every address', async ({ page, request }) => {
    const before = await (await request.get(`${DEMO}/product/saffron-table`)).text();
    expect(before).toMatch(/<meta name="description" content="[^"]{70,}"/); // automatic, never empty
    expect(before).toContain('<link rel="canonical" href="https://sellonbay.com/product/saffron-table"');

    await page.goto(`${DEMO}/dashboard/admin/seo/listings`);
    await page
      .locator('.adm-card', { has: page.locator('a[href="/product/saffron-table"]') })
      .getByRole('link', { name: 'Edit title and description' })
      .click();
    await expect(page).toHaveURL(/edit\?path=%2Fproduct%2Fsaffron-table/);
    await page.getByLabel('Meta title').fill('Saffron Table restaurant site, ready in days');
    await page.getByRole('button', { name: 'Save meta title and description' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Done.' })).toBeVisible();
    await expect(async () => {
      const html = await (await request.get(`${DEMO}/product/saffron-table`)).text();
      expect(html).toContain('<title>Saffron Table restaurant site, ready in days</title>');
    }).toPass({ timeout: 45_000 });
    const reset = await request.post(`${DEMO}/api/admin/seo/pages`, { data: { path: '/product/saffron-table', title: '', description: '' }, headers: { origin: DEMO } });
    expect(reset.status()).toBe(200); // back to the automatic words

    const topic = await (await request.get(`${DEMO}/apps/digital?topic=fonts`)).text();
    expect(topic).toContain('<link rel="canonical" href="https://sellonbay.com/apps/digital?topic=fonts"');
    const xml = await (await request.get(`${DEMO}/sitemap.xml`)).text();
    expect(xml).toContain('/apps/digital?topic=fonts</loc>');
    expect(xml).toContain('/categories</loc>');

    await page.goto(`${DEMO}/dashboard/admin/seo/check`);
    await expect(page.getByRole('heading', { name: 'Every page, topic and listing' })).toBeVisible();
    await expect(page.getByText('Listing: Saffron Table', { exact: false }).first()).toBeVisible();
    expect((await request.get(`${DEMO}/dashboard/admin/seo/pages/edit?path=%2Fproduct%2Fno-such-thing`)).status()).toBe(404);
  });
});
