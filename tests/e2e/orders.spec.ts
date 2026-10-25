import { expect, test, type APIRequestContext } from '@playwright/test';
import { sign } from '../../lib/providers/payment/signature';

/*
 * The order flow through the API, in demo mode (orders are kept in memory there, in the same state machine as the real table):
 * create, pay, wrong moves are refused, delivery, accept, the 7 day hold, the history log, the scheduled job address.
 */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const SITE = 'saffron-table';
const DIGITAL = 'n8n-leads';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };

const make = async (r: APIRequestContext, body: object) => {
  const res = await r.post(`${DEMO}/api/demo/orders`, { data: body });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).id as string;
};
const view = async (r: APIRequestContext, id: string) => (await r.get(`${DEMO}/api/demo/orders/${id}`)).json();
const pay = (r: APIRequestContext, id: string, card = CARD, base = DEMO) => r.post(`${base}/api/demo/orders/${id}/pay`, { data: { card } });
const site = { productId: SITE, pkg: 'asis', domainMode: 'own', own: 'mybakery.com' };

test.describe('orders: state machine through the API', () => {
  test('a new order waits for payment; nothing can move it before it is paid', async ({ request }) => {
    const id = await make(request, site);
    const v = await view(request, id);
    expect(v.state).toBe('awaiting_payment');
    expect(v.events.map((e: { event: string }) => e.event)).toEqual(['created']);
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/accept`)).status()).toBe(409);
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/skip`)).status()).toBe(404); // not funded yet
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/download`)).status()).toBe(403);
  });

  test('a declined card changes nothing; a good card funds the order and logs it', async ({ request }) => {
    const id = await make(request, site);
    expect((await pay(request, id, { ...CARD, number: '4000000000000002' })).status()).toBe(402);
    expect((await view(request, id)).state).toBe('awaiting_payment');
    expect((await pay(request, id)).status()).toBe(200);
    const v = await view(request, id);
    expect(['funded', 'in_delivery']).toContain(v.state);
    expect(v.events.map((e: { event: string }) => e.event)).toContain('funded');
    expect(v.payment).toMatchObject({ brand: 'Visa', last4: '4242' });
    expect(JSON.stringify(v)).not.toContain('4242424242424242');
    expect((await pay(request, id)).status()).toBe(200); // paying again does nothing
    expect((await view(request, id)).events.filter((e: { event: string }) => e.event === 'funded')).toHaveLength(1);
  });

  test('funded, delivered, accepted: dates and history are right, wrong moves are refused', async ({ request }) => {
    const id = await make(request, site);
    await pay(request, id);
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/accept`)).status()).toBe(409); // not delivered yet
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/skip`)).status()).toBe(200);
    let v = await view(request, id);
    expect(v.state).toBe('delivered');
    expect(v.progress.reviewEndsAt - v.progress.deliveredAt).toBe(48 * 3_600_000);
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/accept`, { data: { consent: true } })).status()).toBe(200);
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/accept`)).status()).toBe(409); // already accepted
    v = await view(request, id);
    expect(v.state).toBe('accepted');
    expect(v.progress.payoutAfter - v.progress.acceptedAt).toBe(7 * 86_400_000);
    expect(v.progress.bugfixUntil - v.progress.acceptedAt).toBe(7 * 86_400_000);
    expect(v.events.map((e: { event: string }) => e.event)).toEqual(['created', 'funded', 'demo_skip', 'accepted', 'certificate_issued']);
  });

  test('doing nothing for the review window accepts the order by itself, and the log says so', async ({ request }) => {
    const id = await make(request, site);
    await pay(request, id);
    await request.post(`${DEMO}/api/demo/orders/${id}/skip`); // to delivered
    await request.post(`${DEMO}/api/demo/orders/${id}/skip`); // skip the 48 hours
    const v = await view(request, id);
    expect(v.state).toBe('accepted');
    expect(v.progress.autoAccepted).toBe(true);
    expect(v.events.map((e: { event: string }) => e.event)).toContain('auto_accepted');
  });

  test('an as-is digital product is delivered the moment it is funded, and only then are the files available', async ({ request }) => {
    const id = await make(request, { productId: DIGITAL, pkg: 'asis' });
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/download`)).status()).toBe(403);
    await pay(request, id);
    const v = await view(request, id);
    expect(v.state).toBe('delivered');
    expect(v.instant).toBe(true);
    const link = await request.post(`${DEMO}/api/demo/orders/${id}/download`);
    expect(link.status()).toBe(200);
    expect((await link.json()).licenseKey).toMatch(/^LB-/);
  });

  test('a developer trial is an order of kind trial; a bad id or a made-up id is a plain 404', async ({ request }) => {
    const res = await request.post(`${DEMO}/api/demo/orders`, { data: { kind: 'hire', dev: 'zzz-nobody', pack: 'Trial', brief: 'x'.repeat(30) } });
    expect(res.status()).toBe(404);
    expect((await request.get(`${DEMO}/api/demo/orders/not-an-order`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/api/demo/orders/00000000-0000-4000-8000-000000000000`)).status()).toBe(404);
    expect((await request.get(`${DEMO}/api/demo/orders/..%2F..%2Fetc`)).status()).toBe(404);
  });

  test('the scheduled job address refuses anyone without the secret', async ({ request }) => {
    expect((await request.post(`${DEMO}/api/cron/orders`)).status()).toBe(401);
    expect((await request.post(`${DEMO}/api/cron/orders`, { headers: { authorization: 'Bearer guess' } })).status()).toBe(401);
  });

  test('the order page shows the history and the state', async ({ page }) => {
    const id = await make(page.request, site);
    await pay(page.request, id);
    await page.request.post(`${DEMO}/api/demo/orders/${id}/skip`);
    await page.goto(`${DEMO}/orders/${id}`);
    await expect(page.getByText('Ready to review')).toBeVisible();
    await page.getByText('Order history').click();
    await expect(page.getByText('funded', { exact: false }).first()).toBeVisible();
  });
});

/* The provider's webhook address. The servers for these tests are started with PAYMENT_WEBHOOK_SECRET=e2e-hook-secret (see playwright.config.ts). */
/* Event ids are remembered by the running server, so each run uses its own. */
const RUN = Date.now();
const HOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? 'e2e-hook-secret';
const hook = (r: APIRequestContext, ev: object, secret = HOOK_SECRET, at?: number) => {
  const body = JSON.stringify(ev);
  return r.post(`${DEMO}/api/webhooks/payment`, { data: body, headers: { 'content-type': 'application/json', 'sellonbay-signature': sign(secret, body, at) } });
};
const payEvent = (orderId: string, amountCents: number, id: string) => ({
  id,
  type: 'payment.succeeded',
  orderId,
  amountCents,
  ref: 'pay_hook',
  at: Date.now(),
  card: { brand: 'Visa', last4: '4242' },
});

test.describe('payment webhooks', () => {
  test('an unsigned or wrongly signed webhook is refused before anything is read', async ({ request }) => {
    const id = await make(request, site);
    const total = (await view(request, id)).totalCents;
    expect((await request.post(`${DEMO}/api/webhooks/payment`, { data: payEvent(id, total, `e1-${RUN}`) })).status()).toBe(400);
    expect((await hook(request, payEvent(id, total, `e2-${RUN}`), 'wrong-secret')).status()).toBe(400);
    expect((await hook(request, payEvent(id, total, `e3-${RUN}`), HOOK_SECRET, Math.floor(Date.now() / 1000) - 3600)).status()).toBe(400); // an hour old: replay
    expect((await view(request, id)).state).toBe('awaiting_payment');
  });
  test('a signed payment event funds the order once; the same event again does nothing; the wrong amount is refused', async ({ request }) => {
    const id = await make(request, site);
    const total = (await view(request, id)).totalCents;
    const wrong = await hook(request, payEvent(id, total - 1, `e-wrong-${RUN}`));
    expect(wrong.status()).toBe(422);
    expect((await view(request, id)).state).toBe('awaiting_payment');
    const first = await hook(request, payEvent(id, total, `e-ok-${RUN}`));
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ status: 'applied' });
    expect(await (await hook(request, payEvent(id, total, `e-ok-${RUN}`))).json()).toEqual({ status: 'duplicate' });
    const v = await view(request, id);
    expect(['funded', 'in_delivery']).toContain(v.state);
    expect(v.events.filter((e: { event: string }) => e.event === 'funded')).toHaveLength(1);
  });
  test('an overdue-style cancel: a buyer can cancel before paying, and an unpaid order cannot be cancelled twice', async ({ request }) => {
    const id = await make(request, site);
    const c = await request.post(`${DEMO}/api/demo/orders/${id}/cancel`);
    expect(c.status()).toBe(200);
    expect((await c.json()).refunded).toBe(false);
    expect((await view(request, id)).state).toBe('cancelled');
    expect((await request.post(`${DEMO}/api/demo/orders/${id}/cancel`)).status()).toBe(409);
    expect((await pay(request, id)).status()).toBe(200); // nothing to pay now: treated as already done, does not fund
    expect((await view(request, id)).state).toBe('cancelled');
  });
});

/* The same flow against the real database: rows in `orders`, the append-only `order_events`, and the all-or-nothing order_apply. Skipped until migration 0015 is applied. */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

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

test.describe('orders on the real database', () => {
  test.skip(!env.SUPABASE_SERVICE_ROLE_KEY, 'needs .env.local with Supabase keys');
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321', env.SUPABASE_SERVICE_ROLE_KEY || 'unset', { auth: { persistSession: false } });
  const made: string[] = [];
  let ready = false;
  test.beforeAll(async () => {
    const o = await admin.from('orders').select('lines, instant').limit(1);
    const e = await admin.from('order_events').select('from_state').limit(1);
    ready = !o.error && !e.error;
  });
  test.afterAll(async () => {
    if (made.length) await admin.from('orders').delete().in('id', made);
  });

  test('rows, history, double-apply protection and append-only log', async ({ request }) => {
    test.skip(!ready, 'migration 0015 is not applied yet');
    const res = await request.post(`${REAL}/api/demo/orders`, { data: site });
    const id = (await res.json()).id as string;
    made.push(id);
    let row = (await admin.from('orders').select('*').eq('id', id).single()).data!;
    expect(row).toMatchObject({ status: 'awaiting_payment', kind: 'product', price_cents: expect.any(Number), demo: true, currency: 'USD' });
    expect(row.fee_cents).toBe(Math.round(row.lines[0][1] * (row.lines[0][1] < 2000 ? 0.3 : 0.22))); // 30% under $20, else 22%

    expect((await pay(request, id, CARD, REAL)).status()).toBe(200);
    row = (await admin.from('orders').select('*').eq('id', id).single()).data!;
    expect(['funded', 'in_delivery']).toContain(row.status);
    expect(row.funded_at).toBeTruthy();
    expect(row.payment_last4).toBe('4242');
    expect(JSON.stringify(row)).not.toContain('4242424242424242');

    await request.post(`${REAL}/api/demo/orders/${id}/skip`);
    expect((await request.post(`${REAL}/api/demo/orders/${id}/accept`, { data: { consent: true } })).status()).toBe(200);
    row = (await admin.from('orders').select('*').eq('id', id).single()).data!;
    expect(row.status).toBe('accepted');
    expect(Date.parse(row.payout_after) - Date.parse(row.accepted_at)).toBe(7 * 86_400_000);

    const events = (await admin.from('order_events').select('event, from_state, to_state').eq('order_id', id).order('id')).data!;
    expect(events.map((e) => e.event)).toEqual(['created', 'funded', 'demo_skip', 'accepted', 'certificate_issued']);
    expect(events.find((e) => e.event === 'accepted')).toMatchObject({ from_state: 'delivered', to_state: 'accepted' });

    // a second writer that still thinks the order is delivered loses, and no event is written for it
    const stale = await admin.rpc('order_apply', {
      p_order: id,
      p_from: 'delivered',
      p_patch: { status: 'accepted' },
      p_event: { event: 'stale', from: 'delivered', to: 'accepted', at: new Date().toISOString() },
    });
    expect(stale.data).toBe(false);
    expect((await admin.from('order_events').select('id').eq('order_id', id).eq('event', 'stale')).data).toHaveLength(0);
    // an unknown column is refused, a bad state is refused by the database
    expect((await admin.rpc('order_apply', { p_order: id, p_from: 'accepted', p_patch: { buyer_id: null }, p_event: { event: 'x', at: new Date().toISOString() } })).error).toBeTruthy();
    expect((await admin.rpc('order_apply', { p_order: id, p_from: 'accepted', p_patch: { status: 'banana' }, p_event: { event: 'x', at: new Date().toISOString() } })).error).toBeTruthy();

    // the history cannot be edited or removed on its own
    expect((await admin.from('order_events').update({ event: 'edited' }).eq('order_id', id)).error).toBeTruthy();
    expect((await admin.from('order_events').delete().eq('order_id', id)).error).toBeTruthy();
    expect((await admin.from('order_events').select('id').eq('order_id', id)).data!.length).toBe(5);
  });

  test('ledger in the database: balanced, never negative, once per key, append only', async ({ request }) => {
    test.skip(!ready, 'migration 0015 is not applied yet');
    const probe = await admin.from('ledger_entries').select('id').limit(1);
    test.skip(!!probe.error, 'migration 0016 is not applied yet');
    const res = await request.post(`${REAL}/api/demo/orders`, { data: site });
    const id = (await res.json()).id as string;
    made.push(id);
    const total = (await admin.from('orders').select('price_cents').eq('id', id).single()).data!.price_cents as number;
    await pay(request, id, CARD, REAL);
    const escrow = `order_escrow:${id}`;
    const bal = async (account: string) => Number((await admin.from('ledger_balances').select('net_cents').eq('account', account).maybeSingle()).data?.net_cents ?? 0);
    expect(await bal(escrow)).toBe(total);
    // posting the same business event again changes nothing
    const again = await admin.rpc('ledger_post', {
      p_key: `pay:${id}`,
      p_order: id,
      p_memo: 'again',
      p_lines: [
        { account: 'platform_cash', amountCents: total, side: 'debit' },
        { account: escrow, amountCents: total, side: 'credit' },
      ],
    });
    expect(again.data).toBe(false);
    expect(await bal(escrow)).toBe(total);
    // an entry that does not balance, and one that would take escrow below zero, are refused whole
    const lines = (a: number, b: number) => [
      { account: escrow, amountCents: a, side: 'debit' },
      { account: 'platform_cash', amountCents: b, side: 'credit' },
    ];
    expect((await admin.rpc('ledger_post', { p_key: `bad1:${id}`, p_order: id, p_memo: '', p_lines: lines(100, 99) })).error).toBeTruthy();
    expect((await admin.rpc('ledger_post', { p_key: `bad2:${id}`, p_order: id, p_memo: '', p_lines: lines(total + 1, total + 1) })).error?.message).toMatch(/below zero/);
    expect(await bal(escrow)).toBe(total);
    expect((await admin.from('ledger_entries').select('id').eq('entry_id', `bad2:${id}`)).data).toHaveLength(0);
    // delivered and accepted: escrow is empty, the seller's pending balance and the platform fee add up to the total
    await request.post(`${REAL}/api/demo/orders/${id}/skip`);
    await request.post(`${REAL}/api/demo/orders/${id}/accept`, { data: { consent: true } });
    expect(await bal(escrow)).toBe(0);
    const rows = (await admin.from('ledger_entries').select('account, amount_cents, direction').eq('order_id', id)).data!;
    const net = rows.reduce((sum, r) => sum + (r.direction === 'credit' ? 1 : -1) * Number(r.amount_cents), 0);
    expect(net).toBe(0);
    // append only
    expect((await admin.from('ledger_entries').update({ memo: 'x' }).eq('order_id', id)).error).toBeTruthy();
    expect((await admin.from('ledger_entries').delete().eq('order_id', id)).error).toBeTruthy();
  });
});
