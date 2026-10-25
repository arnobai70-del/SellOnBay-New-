import { expect, test } from '@playwright/test';

/* The free site-ideas tool: the page, the answers, and the guards on the route. Demo mode. */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';

test.describe('site ideas tool', () => {
  test('the page explains itself for search engines: title, description, canonical, FAQ data, examples', async ({ page, request }) => {
    const html = await (await request.get(`${DEMO}/tools/site-ideas`)).text();
    expect(html).toMatch(/<title>Free website idea and domain name generator/);
    expect(html).toContain('rel="canonical"');
    const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)![1]);
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity.length).toBeGreaterThanOrEqual(4);
    await page.goto(`${DEMO}/tools/site-ideas`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Website ideas and domain names, free/);
    await expect(page.getByText('A bakery in Dhaka that sells cakes and bread: a menu page')).toBeVisible();
  });
  test('route guards: a bad idea is 400, no bot check is 400, and a visitor cookie is handed out', async ({ request }) => {
    const first = await request.post(`${DEMO}/api/tools/site-ideas`, { data: { idea: 'ab' } });
    expect(first.status()).toBe(400);
    // the first answer to a new visitor hands out the cookie (the request context keeps it for the next calls)
    expect(first.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('lb-visitor='))?.value).toMatch(/lb-visitor=[0-9a-f-]{36}.*HttpOnly/i);
    expect((await request.post(`${DEMO}/api/tools/site-ideas`, { data: { idea: 'x'.repeat(401) } })).status()).toBe(400);
    expect((await request.post(`${DEMO}/api/tools/site-ideas`, { data: { nope: 1 } })).status()).toBe(400);
    const r = await request.post(`${DEMO}/api/tools/site-ideas`, { data: { idea: `a flower shop ${Date.now()}` } });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toMatch(/bot check/);
    expect(r.headers()['cache-control']).toContain('no-store');
  });
  test('typing an idea gives five pages, ten domain names and three products; the same idea again is free', async ({ page }) => {
    const idea = `a bakery in Dhaka that sells cakes ${Date.now()}`;
    await page.goto(`${DEMO}/tools/site-ideas`);
    await page.getByLabel('Your business or idea, in one line').fill(idea);
    const run = page.getByRole('button', { name: 'Give me ideas' });
    await expect(run).toBeEnabled({ timeout: 20_000 }); // enabled once the bot check has passed
    await run.click();
    await expect(page.getByRole('heading', { name: '5 pages your site should have' })).toBeVisible();
    await expect(page.locator('.siteideas-list li')).toHaveCount(5);
    await expect(page.locator('.siteideas-names li')).toHaveCount(10);
    await expect(page.locator('.siteideas-products li')).toHaveCount(3);
    await expect(page.getByRole('link', { name: 'View domain ideas (unverified)' }).first()).toHaveAttribute('href', /\/domains\?name=/);
    await expect(page.getByText(/free runs? left today/)).toBeVisible();
    // the same idea again: a saved answer, and the page says it was free
    await page.reload();
    await page.getByLabel('Your business or idea, in one line').fill(idea);
    await expect(run).toBeEnabled({ timeout: 20_000 });
    await run.click();
    await expect(page.getByText(/answer was free/)).toBeVisible();
  });
});
