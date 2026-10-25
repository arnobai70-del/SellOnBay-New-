import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Buying a REAL seller's listing, against the real database: the order carries the seller and the listing, the money goes to that seller's accounts,
 * the files come through the signed link, and a listing that is not live, too dear or not offered cannot be bought.
 */
const REAL = process.env.REAL_URL ?? 'http://localhost:3000';
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
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };

test.describe('buying a seller listing', () => {
  test.skip(!env.SUPABASE_SERVICE_ROLE_KEY, 'needs .env.local with Supabase keys');
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', env.SUPABASE_SERVICE_ROLE_KEY || 'unset', { auth: { persistSession: false } });
  const stamp = Date.now();
  const users: string[] = [];
  const orders: string[] = [];
  const slug = `qa-buy-${stamp}`;
  let sellerId = '';
  let buyerId = '';
  let productId = '';
  let buyer: BrowserContext;
  let own: BrowserContext; // the seller, signed in before the seller role is given (a seller then needs an authenticator code to sign in)
  const buyerEmail = `qa-buy-b-${stamp}@launchbay.test`;

  const mk = async (email: string) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'Qa-test-pass-123', email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    return data.user.id;
  };
  const login = async (browser: Browser, email: string) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${REAL}/login`);
    await page.locator('#a-mail').fill(email);
    await page.locator('#a-pass').fill('Qa-test-pass-123');
    await page.locator('form button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20_000 });
    return ctx;
  };
  const balance = async (account: string) => {
    const { data } = await admin.from('ledger_balances').select('net_cents').eq('account', account).maybeSingle();
    return Number(data?.net_cents ?? 0);
  };
  const update = (patch: object) => admin.from('products').update(patch).eq('id', productId);

  test.beforeAll(async ({ browser }) => {
    sellerId = await mk(`qa-buy-s-${stamp}@launchbay.test`);
    buyerId = await mk(buyerEmail);
    own = await login(browser, `qa-buy-s-${stamp}@launchbay.test`);
    await admin.from('profiles').update({ role: 'seller', full_name: 'QA Seller' }).eq('id', sellerId);
    const p = await admin
      .from('products')
      .insert({
        slug,
        seller_id: sellerId,
        name: 'QA Figma kit',
        category: 'Figma kits',
        description: 'x'.repeat(130),
        includes: ['a', 'b', 'c', 'd'],
        price_cents: 2900,
        delivery_days: 1,
        demo_url: 'https://video.example.com/x',
        code_url: 'https://example.com/',
        license: 'mine',
        status: 'live',
        platform: 'digital',
        app_stack: 'Figma',
      })
      .select('id')
      .single();
    productId = p.data!.id as string;
    buyer = await login(browser, buyerEmail);
  });

  test.afterAll(async () => {
    await buyer?.close();
    await own?.close();
    if (orders.length) await admin.from('orders').delete().in('id', orders);
    await admin.from('products').delete().eq('slug', slug);
    for (const u of users) await admin.auth.admin.deleteUser(u);
  });

  const order = (data: object) => buyer.request.post(`${REAL}/api/demo/orders`, { data: { productId: slug, pkg: 'asis', ...data } });

  test('a visitor who is not signed in cannot buy it, and a seller account cannot buy at all', async ({ request }) => {
    const res = await request.post(`${REAL}/api/demo/orders`, { data: { productId: slug, pkg: 'asis' } });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toMatch(/Sign in/);
    const mine = await own.request.post(`${REAL}/api/demo/orders`, { data: { productId: slug, pkg: 'asis' } });
    expect(mine.status()).toBe(403); // only buyer accounts buy
    expect((await mine.json()).error).toMatch(/Only buyer accounts/);
  });

  // The real-provider happy path must be restored once D1 connects a verified PSP.
  // Until then, no test-card payment may create seller credit or file access.
  test.skip('real seller checkout via a verified provider (blocked until D1 is implemented)', async () => {
    const res = await order({});
    expect(res.status(), await res.text()).toBe(200);
    const id = (await res.json()).id as string;
    orders.push(id);
    const row = (await admin.from('orders').select('seller_id, product_id, buyer_id, product_key, demo, status, price_cents').eq('id', id).single()).data!;
    expect(row).toMatchObject({ seller_id: sellerId, product_id: productId, buyer_id: buyerId, product_key: slug, demo: false, status: 'awaiting_payment', price_cents: 2900 });

    expect((await buyer.request.post(`${REAL}/api/demo/orders/${id}/pay`, { data: { card: CARD } })).status()).toBe(200);
    expect(await balance(`order_escrow:${id}`)).toBe(2900);
    // an as-is download from a real seller is delivered at once, and the review time starts
    const view = await (await buyer.request.get(`${REAL}/api/demo/orders/${id}`)).json();
    expect(view.state).toBe('delivered');
    expect(view.real).toBe(true);

    // the files: a signed link for the buyer's own account, never the made-up dummy file
    const link = await buyer.request.post(`${REAL}/api/demo/orders/${id}/download`, { data: {} });
    expect(link.status()).toBe(200);
    const url = (await link.json()).url as string;
    const got = await buyer.request.get(`${REAL}${url}`);
    expect(got.status()).toBe(200);
    const body = await got.text();
    expect(body).not.toContain('SellOnBay demo file');
    const { data: dl } = await admin.from('download_events').select('kind, user_id').eq('order_id', id);
    expect(dl?.some((d) => d.kind === 'real' && d.user_id === buyerId)).toBe(true);
    // somebody else holding the link gets nothing
    expect((await fetch(`${REAL}${url}`)).status).toBeGreaterThanOrEqual(400);

    // accepting releases the money to the SELLER's pending account (price less the 22% fee)
    expect((await buyer.request.post(`${REAL}/api/demo/orders/${id}/accept`, { data: { consent: true } })).status()).toBe(200);
    expect(await balance(`order_escrow:${id}`)).toBe(0);
    expect(await balance(`seller_pending:${sellerId}`)).toBe(2262);
  });

  test('fake cards cannot fund a real seller order or unlock its files', async () => {
    const res = await order({});
    expect(res.status(), await res.text()).toBe(200);
    const id = (await res.json()).id as string;
    orders.push(id);
    const pay = await buyer.request.post(`${REAL}/api/demo/orders/${id}/pay`, { data: { card: CARD } });
    expect(pay.status()).toBe(403);
    expect((await pay.json()).error).toMatch(/only available for example products/i);
    const { data: row } = await admin.from('orders').select('status, payment_ref').eq('id', id).single();
    expect(row?.status).toBe('awaiting_payment');
    expect(row?.payment_ref).toBeFalsy();
    expect(await balance(`order_escrow:${id}`)).toBe(0);
    const link = await buyer.request.post(`${REAL}/api/demo/orders/${id}/download`, { data: {} });
    expect(link.status()).toBeGreaterThanOrEqual(400);
  });

  test('a listing that is not live, is above the price range, or does not offer that package cannot be bought', async () => {
    await update({ status: 'in_review' });
    expect((await order({})).status()).toBe(400);
    await update({ status: 'live', price_cents: 9000 });
    const dear = await order({});
    expect(dear.status()).toBe(400);
    expect((await dear.json()).error).toMatch(/price limit/);
    await update({ price_cents: 2900, setup_price_cents: 0 });
    const none = await order({ pkg: 'setup' });
    expect(none.status()).toBe(400);
    expect((await none.json()).error).toMatch(/does not offer/);
    await update({ setup_price_cents: 3000 });
    const withSetup = await order({ pkg: 'setup' });
    expect(withSetup.status()).toBe(200);
    const id = (await withSetup.json()).id as string;
    orders.push(id);
    expect((await admin.from('orders').select('price_cents, instant').eq('id', id).single()).data).toMatchObject({ price_cents: 5900, instant: false }); // $29 + the seller's own $30
  });
});
