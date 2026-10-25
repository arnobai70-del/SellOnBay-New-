import { expect, test } from '@playwright/test';

/*
 * The public structure: five template categories (the home page and four category pages), their products, and nothing else public.
 * Runs against a server built WITHOUT NEXT_PUBLIC_LEGACY_PUBLIC (demo mode, no database): NEW_URL, default http://localhost:3005.
 * With no database there are no real products yet, so the gate reports what is missing instead of inventing pages.
 */
const NEW = process.env.NEW_URL ?? 'http://localhost:3005';
test.use({ viewport: { width: 1440, height: 900 } });

test('the bar has exactly the five template categories, in order, as plain links', async ({ page }) => {
  await page.goto(NEW + '/');
  const links = page.locator('nav.mk-cats a.mk-cat-link');
  await expect(links).toHaveCount(5);
  expect(await links.allTextContents()).toEqual(['E-commerce Templates', 'SaaS & Startup Templates', 'Business & Corporate Templates', 'Portfolio & Agency Templates', 'Industry Website Templates']);
  expect(await links.evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/', '/templates/saas', '/templates/business', '/templates/portfolio', '/templates/industry']);
  await expect(page.locator('nav.mk-cats .mk-cat-btn')).toHaveCount(0); // no mega menus
  await expect(page.locator('h1')).toHaveCount(1);
});

test('every link in the header, the bar and the footer goes to a page that exists', async ({ page, request }) => {
  await page.goto(NEW + '/');
  const hrefs = await page.locator('header a[href^="/"], footer a[href^="/"]').evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute('href')!.split('#')[0]))]);
  expect(hrefs.length).toBeGreaterThan(8);
  for (const h of hrefs) {
    const r = await request.get(NEW + h, { maxRedirects: 0 });
    expect([200, 301, 302, 307, 308], `${h} answered ${r.status()}`).toContain(r.status());
  }
});

test('the old public site is gone: 410 for pages and public APIs, with noindex', async ({ request }) => {
  for (const p of [
    '/browse',
    '/apps/android',
    '/apps/digital?topic=audio',
    '/categories',
    '/developers',
    '/developers/join',
    '/domains',
    '/find',
    '/blog',
    '/tools/site-ideas',
    '/welcome',
    '/websites/stores',
    '/guest',
  ]) {
    const r = await request.get(NEW + p);
    expect(r.status(), p).toBe(410);
    expect(r.headers()['x-robots-tag'], p).toContain('noindex');
  }
  for (const p of ['/api/domains?name=x', '/api/tools/site-ideas', '/api/developers']) expect((await request.get(NEW + p)).status(), p).toBe(410);
});

test('legal and help pages stay reachable but are kept out of search; the working routes still work', async ({ request }) => {
  for (const p of ['/terms', '/privacy', '/refunds', '/acceptable-use', '/seller-agreement', '/dmca', '/report-abuse', '/faq', '/how-it-works', '/sell']) {
    const r = await request.get(NEW + p);
    expect(r.status(), p).toBe(200);
    expect(await r.text(), p).toMatch(/<meta name="robots" content="noindex/);
  }
  expect((await request.get(NEW + '/login')).status()).toBe(200);
  expect((await request.get(NEW + '/api/health')).status()).toBe(200);
});

test('the category pages: the home page and four category addresses; the old shapes redirect or answer 404', async ({ request }) => {
  const home = await request.get(NEW + '/');
  expect(home.status()).toBe(200);
  expect(await home.text()).not.toMatch(/content="noindex/);
  for (const p of ['/templates/saas', '/templates/business', '/templates/portfolio', '/templates/industry']) {
    const r = await request.get(NEW + p);
    expect(r.status(), p).toBe(200);
    const html = await r.text();
    expect(html, p).toContain('<h1>');
    expect(html, p).toMatch(/<link rel="canonical" href="https:\/\/[^"]+\/templates\/[a-z]+"/);
  }
  const eco = await request.get(NEW + '/templates/ecommerce', { maxRedirects: 0 });
  expect([301, 308]).toContain(eco.status());
  expect(eco.headers()['location']).toMatch(/\/$/);
  for (const p of ['/templates/saas-startup', '/templates/figma-ui-kits', '/product/saffron-table', '/templates/saas/no-such-product']) expect((await request.get(NEW + p)).status(), p).toBe(404);
});

test('the sitemap lists only real addresses and never invents any; robots.txt names it', async ({ request }) => {
  const xml = await (await request.get(NEW + '/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeLessThanOrEqual(25);
  expect(locs.length).toBeGreaterThanOrEqual(1);
  expect(new Set(locs).size).toBe(locs.length);
  for (const l of locs) expect(l, l).toMatch(/^https:\/\/[^/]+(\/|\/templates\/[a-z-]+(\/[a-z0-9-]+)?)$/);
  for (const bad of ['/browse', '/apps', '/blog', '/terms', '/login', '/dashboard', '/checkout', '/search', '/product/', '/welcome']) expect(xml, bad).not.toContain(bad);
  expect(await (await request.get(NEW + '/robots.txt')).text()).toContain('/sitemap.xml');
});

test('search answers with products and categories only, from the five categories', async ({ request }) => {
  const r = await request.get(NEW + '/api/search?q=templates');
  expect(r.status()).toBe(200);
  const body = JSON.stringify(await r.json());
  expect(body).not.toMatch(/\/developers|\/blog|\/apps\/|\/browse|\/domains/);
});
