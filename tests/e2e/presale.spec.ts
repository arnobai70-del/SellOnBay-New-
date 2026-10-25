import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
const PRODUCT = 'n8n-leads';
// Limits are kept in the server's memory, so every run uses its own made-up addresses and can be repeated without restarting the app.
const RUN = Math.floor(Math.random() * 200) + 20;
const ip = (group: number, n: number) => `10.${RUN}.${group}.${n}`;
/* Give every request from this page to the app one fixed address. */
async function fromAddress(page: Page, address: string) {
  await page.route(`${DEMO}/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': address } }));
}

/* Fill the question box and send. The Turnstile test widget needs a second or two to pass, so we retry until the page answers. */
async function ask(page: Page, text: string) {
  await page.getByLabel('Your question for the seller').fill(text);
  const send = page.getByRole('button', { name: 'Send question' });
  const sent = page.getByText('Sent. The seller will reply here.');
  const alert = page.getByRole('alert');
  for (let i = 0; i < 20; i++) {
    await send.click();
    // wait for the page to answer before deciding to try again, so one question is never sent twice
    await Promise.race([sent.waitFor({ timeout: 4000 }), alert.waitFor({ timeout: 4000 })]).catch(() => null);
    if (await sent.count()) return;
    if (await alert.count()) {
      if (/bot check to finish/.test((await alert.first().textContent()) ?? '')) {
        await page.waitForTimeout(800);
        continue;
      }
      return;
    }
  }
}

test.describe('pre-sale question in the browser (demo mode)', () => {
  test('a buyer asks a question and it shows up under the listing', async ({ page }) => {
    await fromAddress(page, ip(9, 1));
    await page.goto(`${DEMO}/product/${PRODUCT}`);
    await page.waitForTimeout(1800); // a form sent faster than a person can type is refused on purpose
    await ask(page, 'Does the workflow work with n8n cloud, or only self-hosted?');
    await expect(page.getByText('Sent. The seller will reply here.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Your questions' })).toContainText('n8n cloud');
  });

  test('a message with a phone number is blocked, never shown, and the admin sees why', async ({ page }) => {
    await fromAddress(page, ip(9, 2));
    await page.goto(`${DEMO}/product/${PRODUCT}`);
    await page.waitForTimeout(1800);
    await ask(page, 'Please call me on +880 1712 345678 to talk about the price');
    await expect(page.getByText('We could not send that')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Your questions' })).toHaveCount(0);
    await page.goto(`${DEMO}/dashboard/admin`);
    const list = page.locator('[data-blocked-list]');
    await expect(list).toContainText('phone number');
    await expect(list).toContainText('Pre-sale question');
    await expect(list).toContainText('1712 345678');
  });

  test('an obfuscated email is blocked too', async ({ page }) => {
    await fromAddress(page, ip(9, 3));
    await page.goto(`${DEMO}/product/${PRODUCT}`);
    await page.waitForTimeout(1800);
    await ask(page, 'Mail me: name at gmail dot com');
    await expect(page.getByText('We could not send that')).toBeVisible();
  });
});

test.describe('pre-sale question API guards (demo mode)', () => {
  const post = (request: import('@playwright/test').APIRequestContext, body: object, ip: string) => request.post(`${DEMO}/api/presale`, { data: body, headers: { 'x-forwarded-for': ip } });
  const good = (over: object = {}) => ({ productKey: PRODUCT, body: 'Does it need an AI key of my own?', token: 'test-token', hp: '', startedAt: Date.now() - 5000, ...over });

  test('bot traps: hidden field is silently dropped, a too-fast form and a missing bot token are refused', async ({ request }) => {
    expect((await post(request, good({ hp: 'http://spam' }), ip(1, 1))).status()).toBe(200); // pretends to work, saves nothing
    expect((await post(request, good({ startedAt: Date.now() }), ip(1, 2))).status()).toBe(400);
    expect((await post(request, good({ token: '' }), ip(1, 3))).status()).toBe(400);
  });

  test('a message the filter blocks gets 422 and is recorded', async ({ request }) => {
    const r = await post(request, good({ body: 'pay me on paypal and skip the escrow' }), ip(1, 4));
    expect(r.status()).toBe(422);
    expect((await r.json()).blocked).toBe(true);
  });

  test('rate limit per person: the sixth question in a few minutes is stopped', async ({ request }) => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await post(request, good({ body: `Question number ${i} about the setup steps` }), ip(1, 5))).status());
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
  });

  test('unknown listings and over-long questions are refused', async ({ request }) => {
    expect((await post(request, good({ productKey: 'does-not-exist' }), ip(1, 6))).status()).toBe(404);
    expect((await post(request, good({ body: 'x'.repeat(501) }), ip(1, 7))).status()).toBe(400);
    expect((await post(request, good({ body: 'hi' }), ip(1, 8))).status()).toBe(400);
  });
});

/* Real database: sign-in needed, per-address and daily caps, blocked rows with a reason. */
const envFile = path.join(__dirname, '..', '..', '.env.local');
const env: Record<string, string> = fs.existsSync(envFile)
  ? Object.fromEntries(
      fs
        .readFileSync(envFile, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    )
  : {};

test.describe('pre-sale question API guards (real database)', () => {
  test.skip(!env.SUPABASE_SERVICE_ROLE_KEY, 'needs .env.local with Supabase keys');
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', env.SUPABASE_SERVICE_ROLE_KEY || 'unset', { auth: { persistSession: false } });
  const ids: string[] = [];
  const slug = `qa-presale-${Date.now()}`;
  let sellerId = '';

  test.beforeAll(async () => {
    const mk = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password: 'Qa-test-pass-123', email_confirm: true });
      if (error) throw error;
      ids.push(data.user.id);
      return data.user.id;
    };
    sellerId = await mk('qa-ps-seller@launchbay.test');
    await mk('qa-ps-a@launchbay.test');
    await mk('qa-ps-b@launchbay.test');
    await mk('qa-ps-c@launchbay.test');
    const { error } = await admin.from('products').insert({
      slug,
      seller_id: sellerId,
      name: 'QA Script',
      category: 'Scripts',
      description: 'x'.repeat(40),
      price_cents: 2900,
      delivery_days: 1,
      demo_url: 'about:blank',
      code_url: 'https://example.com/',
      license: 'mine',
      status: 'live',
      platform: 'digital',
      app_stack: 'Python',
    });
    if (error) throw error;
  });

  test.afterAll(async () => {
    await admin.from('presale_messages').delete().in('buyer_id', ids);
    await admin.from('blocked_messages').delete().in('sender_id', ids);
    await admin.from('products').delete().eq('slug', slug);
    for (const u of ids) await admin.auth.admin.deleteUser(u);
  });

  async function login(browser: import('@playwright/test').Browser, email: string) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${REAL}/login`);
    await page.locator('#a-mail').fill(email);
    await page.locator('#a-pass').fill('Qa-test-pass-123');
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 }).catch(() => null), page.locator('form button[type=submit]').click()]);
    return ctx;
  }
  const body = (over: object = {}) => ({ productKey: slug, body: 'Does the script run on Windows as well?', token: 'test-token', hp: '', startedAt: Date.now() - 5000, ...over });

  test('signed out gets 401; signed in is stored for the right seller; a blocked one is stored with its reason', async ({ browser, request }) => {
    const anon = await request.post(`${REAL}/api/presale`, { data: body(), headers: { 'x-forwarded-for': ip(2, 1) } });
    expect(anon.status()).toBe(401);
    const a = await login(browser, 'qa-ps-a@launchbay.test');
    const ok = await a.request.post(`${REAL}/api/presale`, { data: body(), headers: { 'x-forwarded-for': ip(2, 2) } });
    expect(ok.status()).toBe(200);
    const { data: saved } = await admin.from('presale_messages').select('seller_id, product_key, body').eq('product_key', slug);
    expect(saved?.[0]?.seller_id).toBe(sellerId);
    const bad = await a.request.post(`${REAL}/api/presale`, { data: body({ body: 'my number is 01712 345 678' }), headers: { 'x-forwarded-for': ip(2, 2) } });
    expect(bad.status()).toBe(422);
    const { data: blocked } = await admin.from('blocked_messages').select('reason, context, body, product_key').eq('product_key', slug);
    expect(blocked?.[0]).toMatchObject({ reason: 'phone', context: 'presale', product_key: slug });
    expect(blocked?.[0]?.body).toContain('01712');
    await a.close();
  });

  test('per-address limit: many people on one connection are stopped after 10 questions in a few minutes', async ({ browser }) => {
    const crowd = ip(2, 9);
    const codes: number[] = [];
    for (const email of ['qa-ps-b@launchbay.test', 'qa-ps-c@launchbay.test']) {
      const ctx = await login(browser, email);
      for (let i = 0; i < 5; i++)
        codes.push((await ctx.request.post(`${REAL}/api/presale`, { data: body({ body: `Question ${i} about the setup steps` }), headers: { 'x-forwarded-for': crowd } })).status());
      await ctx.close();
    }
    const a = await login(browser, 'qa-ps-a@launchbay.test');
    // user A already sent 2 above from another address; this one comes from the crowded address
    codes.push((await a.request.post(`${REAL}/api/presale`, { data: body({ body: 'One more question about the licence' }), headers: { 'x-forwarded-for': crowd } })).status());
    await a.close();
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes[10]).toBe(429);
  });

  test('daily cap: at most 5 questions a day from one buyer to one seller, blocked ones count too', async ({ browser }) => {
    const { data: u } = await admin.auth.admin.listUsers();
    const buyer = u.users.find((x) => x.email === 'qa-ps-a@launchbay.test')!;
    await admin.from('presale_messages').delete().eq('buyer_id', buyer.id);
    await admin.from('blocked_messages').delete().eq('sender_id', buyer.id);
    const rows = Array.from({ length: 3 }, (_, i) => ({ buyer_id: buyer.id, seller_id: sellerId, product_key: slug, body: `Earlier question ${i} about it` }));
    await admin.from('presale_messages').insert(rows);
    await admin.from('blocked_messages').insert([
      { sender_id: buyer.id, seller_id: sellerId, product_key: slug, body: 'call 0171234567', reason: 'phone', context: 'presale' },
      { sender_id: buyer.id, seller_id: sellerId, product_key: slug, body: 'x@y.com', reason: 'email', context: 'presale' },
    ]);
    const a = await login(browser, 'qa-ps-a@launchbay.test');
    const r = await a.request.post(`${REAL}/api/presale`, { data: body({ body: 'A sixth question today about the setup' }), headers: { 'x-forwarded-for': ip(2, 77) } });
    expect(r.status()).toBe(429);
    expect((await r.json()).error).toMatch(/5 questions a day/);
    await a.close();
  });
});
