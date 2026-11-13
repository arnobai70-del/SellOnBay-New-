import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';

/*
 * The affiliate program (owner, 2026-11-12) on the demo build without a database (DEMO_URL). It starts off; the admin page has twelve sections;
 * every editor saves and shows on the public page at once; the demo's stand-in account joins, gets links, saves a payout method and opts out
 * of the leaderboard; the referral cookie follows the cookie choice; an admin suspends and reactivates; the CSV downloads. Program off at the end.
 * A referred PAID sale cannot happen here (purchases need a quotation and an account); tests/unit/affiliates*.test.ts cover the money.
 */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const api = (r: APIRequestContext, data: object) => r.post(`${DEMO}/api/admin/affiliates`, { data, headers: { origin: DEMO } });
/* While the program is off the page is public (owner, 2026-11-12) but says it opens soon, with no join button and no leaderboard. */
const expectClosed = async (r: APIRequestContext) => {
  const res = await r.get(`${DEMO}/affiliates`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('Opening soon');
  expect(html).not.toContain('Join the affiliate program');
  expect(html).not.toContain('top 5');
};
const on = (r: APIRequestContext, extra: object = {}) => api(r, { action: 'settings', settings: { enabled: true, ...extra } });
const save = async (page: Page, form = 0) => {
  await page.getByRole('button', { name: 'Save', exact: true }).nth(form).click(); // the Commission tab has two forms: rates, then eligible websites
  await expect(page.getByRole('status').filter({ hasText: 'Saved. It applies now.' })).toBeVisible();
};
const SECTIONS: [string, string, RegExp][] = [
  ['overview', 'Overview', /Withdrawals waiting/],
  ['accounts', 'Accounts', /Affiliate|No affiliates yet/],
  ['registration', 'Registration & qualification', /Registration fee and qualification/],
  ['commission', 'Commission', /Rates and approval/],
  ['tracking', 'Referral tracking', /Referral cookie/],
  ['reports', 'Reports', /Download CSV/],
  ['badges', 'Badges', /Badges follow verified/],
  ['leaderboard', 'Leaderboard', /This month/],
  ['withdrawals', 'Withdrawals', /No withdrawals yet|Mark paid|paid/],
  ['fraud', 'Fraud', /Fraud rules/],
  ['notifications', 'Notifications', /Tell an affiliate when they qualify/],
  ['settings', 'Program settings', /While the program is off/],
];
/*
 * A fresh browser with a cookie choice already made: "all" (analytics accepted) or "1" (only what is needed). It uses an ordinary browser's
 * user agent: headless Edge calls itself HeadlessChrome, and the click route ignores bots on purpose (checked in its own test below).
 */
const PERSON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const withChoice = async (browser: Browser, choice: 'all' | '1') =>
  browser.newContext({
    extraHTTPHeaders: { 'x-sob-e2e': '1' },
    userAgent: PERSON_UA,
    storageState: { cookies: [], origins: [{ origin: DEMO, localStorage: [{ name: 'lb-cookies', value: choice }] }] },
  });

test.describe.configure({ mode: 'serial' });
test.describe('Affiliate Management', () => {
  test.afterAll(async ({ request }) => {
    await api(request, { action: 'settings', settings: { enabled: false } });
  });

  test('the program starts off; all twelve admin sections open', async ({ page, request }) => {
    await expectClosed(request); // public, but closed: opening soon, no way to join
    await page.goto(`${DEMO}/`);
    await page.getByRole('navigation').getByRole('link', { name: 'Affiliate', exact: true }).first().click(); // always in the top menu
    await expect(page).toHaveURL(/\/affiliates$/);
    await expect(page.getByText('Opening soon')).toBeVisible();
    await page.goto(`${DEMO}/admin/affiliates`);
    await expect(page.getByRole('heading', { name: 'Affiliate Management' })).toBeVisible();
    await expect(page.getByText('Program off')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Affiliate Management' });
    await expect(nav.getByRole('link')).toHaveCount(12);
    for (const [key, label, words] of SECTIONS) {
      await nav.getByRole('link', { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`tab=${key}`));
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('main').getByText(words).first(), label).toBeVisible();
    }
  });

  test('the switch opens the public page with the saved rates, and closes it again, without a redeploy', async ({ request }) => {
    const r = await on(request, { intro: 'Test affiliate intro', rates: { first_purchase: 2000 } });
    expect(r.status(), await r.text()).toBe(200);
    const html = await (await request.get(`${DEMO}/affiliates`)).text();
    expect(html).toContain('Test affiliate intro');
    expect(html).toContain('20%');
    expect((await api(request, { action: 'settings', settings: { enabled: false } })).status()).toBe(200);
    await expectClosed(request); // public, but closed: opening soon, no way to join
  });

  test('the editors save from the admin page and show on the public page: target, rates, cookie, badges, benefits, questions, terms, leaderboard', async ({ page, request }) => {
    await on(request);
    await page.goto(`${DEMO}/admin/affiliates?tab=registration`);
    await page.getByLabel('Qualification target').fill('4');
    await page.getByLabel('Qualification period').fill('45');
    await save(page);
    await page.goto(`${DEMO}/admin/affiliates?tab=commission`);
    await page.getByLabel('Repeat website purchase rate').fill('6');
    await page.getByLabel('Minimum withdrawal (USD)').fill('25');
    await save(page);
    await page.goto(`${DEMO}/admin/affiliates?tab=tracking`);
    await page.getByLabel('Referral cookie').fill('30');
    await save(page);
    await page.goto(`${DEMO}/admin/affiliates?tab=badges`);
    await page.getByLabel('Name').first().fill('Verified Partner E2E');
    await save(page);
    await page.goto(`${DEMO}/admin/affiliates?tab=settings`);
    await page.getByRole('button', { name: '+ Add benefit' }).click();
    await page.getByLabel('Benefit 4').fill('E2E benefit line');
    await page.getByRole('button', { name: '+ Add question' }).click();
    await page.getByLabel('Question 1').fill('Is this an E2E question?');
    await page.getByLabel('Answer 1').fill('Yes, saved from the admin page.');
    await page.getByLabel('Terms version').fill('aff-e2e-2');
    await save(page);
    const html = await (await request.get(`${DEMO}/affiliates`)).text();
    for (const words of ['Reach 4 verified', '45 days', '6%', '$25', 'for 30 days', 'Verified Partner E2E', 'E2E benefit line', 'Is this an E2E question?', 'Version aff-e2e-2'])
      expect(html.replace(/<!-- -->/g, ''), words).toContain(words);
    // the public leaderboard can be hidden
    await page.goto(`${DEMO}/admin/affiliates?tab=settings`);
    await page.getByLabel('Show the public monthly leaderboard (top 5)').uncheck();
    await save(page);
    expect(await (await request.get(`${DEMO}/affiliates`)).text()).not.toContain('top 5');
  });

  test('turning the program off from the admin page asks first, then hides the page', async ({ page, request }) => {
    await on(request);
    await page.goto(`${DEMO}/admin/affiliates?tab=settings`);
    page.once('dialog', (d) => void d.accept());
    await page.getByLabel(/The affiliate program is on/).uncheck();
    await save(page);
    await expectClosed(request); // public, but closed: opening soon, no way to join
  });

  test('signed in (the demo stand-in account): join, links, payout method, leaderboard opt-out; the referral cookie follows the cookie choice', async ({ page, request, browser }) => {
    await on(request, { minWithdrawalCents: 5000 });
    await page.goto(`${DEMO}/affiliates`);
    await page.getByRole('link', { name: 'Join the affiliate program' }).click();
    await expect(page).toHaveURL(/\/dashboard\/buyer\/affiliate/);
    const join = page.getByRole('button', { name: 'Join the affiliate program' });
    await expect(page.getByRole('heading', { name: /^(Join the affiliate program|E2E Picks)$/ })).toBeVisible(); // the dashboard has rendered
    if (await join.count()) {
      await page.getByLabel(/Public name/).fill('E2E Picks');
      await expect(join).toBeDisabled(); // terms first
      await page.getByRole('checkbox', { name: /I accept the affiliate terms/ }).check();
      await join.click();
    }
    await expect(page.getByRole('heading', { name: 'E2E Picks' })).toBeVisible();
    await expect(page.getByText('Qualification pending').first()).toBeVisible();
    const code = (await page.getByText(/^Code AFF/).innerText()).match(/Code (AFF[A-Z0-9]+)/)![1];

    // links: a general one and one per eligible website
    const link = page.getByLabel('Your referral link');
    await expect(link).toHaveValue(new RegExp(`/\\?ref=${code}$`));
    const site = page.getByLabel('Link to');
    const options = await site.locator('option').count();
    if (options > 1) {
      await site.selectOption({ index: 1 });
      await expect(link).toHaveValue(new RegExp(`/websites/[a-z0-9-]+\\?ref=${code}$`));
    }

    // payout method, saved masked; nothing to withdraw yet
    await page.getByLabel('Payout method').selectOption('PayPal');
    await page.getByLabel(/Payout details/).fill('e2e-affiliate@example.com');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/saved: ••••\.com/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request withdrawal' })).toBeDisabled();
    await page.getByLabel('Show me on the public leaderboard').uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

    // consent: with analytics accepted the visit is remembered (signed, httpOnly cookie); with "only what is needed" it is not
    for (const [choice, remembered] of [
      ['all', true],
      ['1', false],
    ] as const) {
      const ctx = await withChoice(browser, choice);
      const tab = await ctx.newPage();
      const sent = tab.waitForResponse((r) => r.url().includes('/api/affiliates/click'));
      await tab.goto(`${DEMO}/?ref=${code}`);
      const resp = await sent;
      expect(resp.status()).toBe(200);
      const cookie = (await ctx.cookies()).find((c) => c.name === 'sob_ref');
      expect(!!cookie, `cookie with choice ${choice}`).toBe(remembered);
      if (cookie) {
        expect(cookie.httpOnly).toBe(true);
        expect(cookie.value.startsWith(`${code}.`)).toBe(true);
        expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(59 * 86_400_000);
      }
      await ctx.close();
    }
    await page.reload();
    await expect(page.locator('.kpi').filter({ hasText: 'Clicks' }).locator('.v')).toHaveText(/^[12]$/); // counted both times, once per visitor
  });

  test('an admin suspends and reactivates an affiliate; links stop while suspended; the CSV downloads', async ({ page, request }) => {
    await on(request);
    await page.goto(`${DEMO}/admin/affiliates?tab=accounts`);
    const row = page.locator('tr').filter({ hasText: 'E2E Picks' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Suspended' }).click();
    await row.getByLabel('Reason (kept in the audit log)').fill('E2E check');
    await row.getByRole('button', { name: 'Suspended' }).click();
    await expect(row.locator('.status').first()).toHaveText('Suspended');
    const code = (await row.locator('.tag').first().innerText()).match(/AFF[A-Z0-9]+/)![0];
    const click = async () =>
      (await request.post(`${DEMO}/api/affiliates/click`, { data: { code, product: '', consent: true }, headers: { origin: DEMO, 'user-agent': PERSON_UA } })).headers()['set-cookie'] ?? '';
    expect(await click()).not.toContain('sob_ref'); // suspended: the link stops
    await row.getByRole('button', { name: 'Qualification pending' }).click();
    await expect(row.locator('.status').first()).toHaveText('Qualification pending');
    expect(await click()).toContain('sob_ref'); // reactivated: it works again

    await page.goto(`${DEMO}/admin/affiliates?tab=reports`);
    const dl = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download CSV' }).click();
    const file = await dl;
    const text = await (await file.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
    expect(text.split('\n')[0]).toBe('code,display_name,status,joined,clicks,referrals,verified_sales,pending_usd,approved_usd,reversed');
    expect(text).toContain(code);
    expect(text).not.toContain('example.com'); // no payout details or customer data
  });

  test('the public page and the admin page fit a phone and a desktop', async ({ page, request }) => {
    await on(request);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/affiliates', '/admin/affiliates?tab=commission', '/admin/affiliates?tab=badges', '/dashboard/buyer/affiliate']) {
        await page.goto(`${DEMO}${path}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} at ${width}px`).toBeLessThanOrEqual(width);
      }
    }
    await page.goto(`${DEMO}/affiliates`);
    await expect(page.getByRole('link', { name: 'Join the affiliate program' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Affiliate terms' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /top 5/i })).toBeVisible();
  });

  test('a bot (headless browser) is never counted and gets no cookie', async ({ request }) => {
    await on(request);
    const code = (await (await request.get(`${DEMO}/dashboard/buyer/affiliate`)).text()).match(/AFF[A-Z0-9]{6}/)?.[0] ?? 'AFFTEST1';
    const r = await request.post(`${DEMO}/api/affiliates/click`, { data: { code, product: '', consent: true }, headers: { origin: DEMO, 'user-agent': 'Mozilla/5.0 HeadlessChrome/130.0 bot-check' } });
    expect(r.status()).toBe(200);
    expect(r.headers()['set-cookie'] ?? '').not.toContain('sob_ref');
  });

  test('a click is refused while the program is off', async ({ request }) => {
    await api(request, { action: 'settings', settings: { enabled: false } });
    const r = await request.post(`${DEMO}/api/affiliates/click`, { data: { code: 'AFFTEST1', product: '', consent: true }, headers: { origin: DEMO } });
    expect(r.headers()['set-cookie'] ?? '').not.toContain('sob_ref');
  });
});
