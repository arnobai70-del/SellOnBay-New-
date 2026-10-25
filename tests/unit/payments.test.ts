import { describe, expect, it } from 'vitest';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { DAY_MS } from '@/lib/config';
import { auditList } from '@/lib/admin/audit';
import { series } from '@/lib/metrics';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder, orderEvents, runDueJobs } from '@/lib/orders/service';
import { FakePaymentProvider, signedEvent } from '@/lib/providers/payment/fake';
import { TOLERANCE_SECONDS, sign, verify } from '@/lib/providers/payment/signature';
import { WebhookError, type VerifiedEvent } from '@/lib/providers/payment/types';

const SECRET = 'test-secret';
const NOW = 1_800_000_000;
const ev = (over: Partial<VerifiedEvent> = {}): VerifiedEvent => ({
  id: 'evt_1',
  type: 'payment.succeeded',
  orderId: 'o',
  amountCents: 5000,
  ref: 'pay_1',
  at: NOW * 1000,
  card: { brand: 'Visa', last4: '4242' },
  ...over,
});

describe('webhook signatures', () => {
  const body = JSON.stringify(ev());
  it('accepts a genuine, fresh event', () => {
    expect(verify(SECRET, body, sign(SECRET, body, NOW), NOW)).toMatchObject({ id: 'evt_1', type: 'payment.succeeded' });
  });
  it('refuses a changed body, another secret, a missing or broken header', () => {
    const h = sign(SECRET, body, NOW);
    expect(() => verify(SECRET, body.replace('5000', '1'), h, NOW)).toThrow(WebhookError);
    expect(() => verify('other', body, h, NOW)).toThrow(WebhookError);
    expect(() => verify(SECRET, body, null, NOW)).toThrow(WebhookError);
    expect(() => verify(SECRET, body, 'garbage', NOW)).toThrow(WebhookError);
    expect(() => verify(SECRET, body, `t=${NOW},v1=abcd`, NOW)).toThrow(WebhookError);
    expect(() => verify('', body, h, NOW)).toThrow(/secret/);
  });
  it('refuses an old signature (replay): the window is 5 minutes either way', () => {
    const h = sign(SECRET, body, NOW);
    expect(() => verify(SECRET, body, h, NOW + TOLERANCE_SECONDS)).not.toThrow();
    expect(() => verify(SECRET, body, h, NOW + TOLERANCE_SECONDS + 1)).toThrow(/too old/);
    expect(() => verify(SECRET, body, h, NOW - TOLERANCE_SECONDS - 1)).toThrow(/too old/);
  });
  it('refuses an event with the wrong shape even if it is signed', () => {
    const bad = JSON.stringify({ id: 'x', type: 'payment.succeeded', amountCents: -5 });
    expect(() => verify(SECRET, bad, sign(SECRET, bad, NOW), NOW)).toThrow(/shape/);
    const notJson = 'hello';
    expect(() => verify(SECRET, notJson, sign(SECRET, notJson, NOW), NOW)).toThrow(/JSON/);
  });
});

describe('FakePaymentProvider', () => {
  it('implements the interface and records its calls', async () => {
    const p = new FakePaymentProvider();
    expect(await p.createCheckout({ id: 'o1', amountCents: 100, title: 't', currency: 'USD' })).toEqual({ url: '/pay/o1' });
    await p.capture('o1');
    await p.refund('o1', 50);
    await p.releaseToSeller('o1', 40);
    expect(p.calls.map((c) => c.method)).toEqual(['createCheckout', 'capture', 'refund', 'releaseToSeller']);
  });
  it('reads a signed webhook from a request, and refuses an unsigned one', async () => {
    const p = new FakePaymentProvider();
    const s = signedEvent(ev());
    const good = new Request('http://x/hook', { method: 'POST', body: s.body, headers: { 'sellonbay-signature': s.signature } });
    expect((await p.parseWebhook(good)).id).toBe('evt_1');
    await expect(p.parseWebhook(new Request('http://x/hook', { method: 'POST', body: s.body }))).rejects.toThrow(WebhookError);
  });
  it('only test cards work', async () => {
    const p = new FakePaymentProvider();
    const card = { number: '4242 4242 4242 4242', exp: '12/34', cvc: '123', name: 'A B' };
    expect((await p.chargeTestCard({ orderId: 'o', amountCents: 100, card })).ok).toBe(true);
    expect(await p.chargeTestCard({ orderId: 'o', amountCents: 100, card: { ...card, number: '5555555555554444' } })).toMatchObject({ ok: false, code: 'invalid' });
  });
});

const newOrder = (over: object = {}) =>
  createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'live_site',
    title: 'Site',
    lines: [['Site', 10_000]],
    days: 2,
    buyerId: null,
    sellerId: 'seller-x',
    productKey: 'saffron-table',
    demo: false,
    ...over,
  });
const paid = (o: { id: string; priceCents: number }, id = 'evt_' + o.id, over: Partial<VerifiedEvent> = {}) =>
  handlePaymentEvent('verified-test-psp', ev({ id, orderId: o.id, amountCents: o.priceCents, ref: 'pay_' + o.id, ...over }));

describe('payment events change orders and the ledger, once', () => {
  it('a payment event funds the order, posts the ledger and logs it; the same event again changes nothing', async () => {
    const o = await newOrder();
    expect(await paid(o)).toEqual({ status: 'applied' });
    expect(await paid(o)).toEqual({ status: 'duplicate' });
    const after = (await getOrder(o.id))!;
    expect(after.state).toBe('funded');
    expect(after.payment).toMatchObject({ ref: 'pay_' + o.id, brand: 'Visa', last4: '4242' });
    expect((await orderEvents(o.id)).filter((e) => e.event === 'funded')).toHaveLength(1);
    const L = await ledgerStore();
    expect(await L.balance(acct.escrow(o.id))).toBe(10_000);
  });
  it('a different event id for an already funded order is ignored, not funded twice', async () => {
    const o = await newOrder();
    await paid(o, 'evt_a');
    expect((await paid(o, 'evt_b')).status).toBe('ignored');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(10_000);
  });
  it('a payment for the wrong amount or an unknown order never funds anything', async () => {
    const o = await newOrder();
    expect(await paid(o, 'evt_short', { amountCents: 1 })).toEqual({ status: 'rejected', reason: 'amount does not match the order' });
    expect((await getOrder(o.id))!.state).toBe('awaiting_payment');
    expect((await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_ghost', orderId: '00000000-0000-4000-8000-000000000001' }))).status).toBe('rejected');
    // a rejected event can be sent again once it is right (its claim was released)
    expect((await paid(o, 'evt_short', {})).status).toBe('applied');
  });
  it('accepted: money moves from escrow to the seller (pending) and the platform; after the hold it is available', async () => {
    const o = await newOrder({
      lines: [
        ['Site', 10_000],
        ['Domain', 1_500],
      ],
    });
    await paid(o);
    expect((await deliver(o.id, 'seller-x')).ok).toBe(true);
    expect((await accept(o.id, null)).ok).toBe(true);
    const L = await ledgerStore();
    expect(await L.balance(acct.escrow(o.id))).toBe(0);
    expect(await L.balance(acct.pending('seller-x'))).toBe(7_800);
    expect((await getOrder(o.id))!.state).toBe('accepted');
    // seven days and a minute later the scheduled job ends the hold
    await runDueJobs(Date.now() + 7 * DAY_MS + 60_000);
    const done = (await getOrder(o.id))!;
    expect(['accepted', 'payout_pending']).toContain(done.state);
    await runDueJobs(Date.now() + 8 * DAY_MS);
    expect(await L.balance(acct.pending('seller-x'))).toBe(0);
    expect(await L.balance(acct.available('seller-x'))).toBe(7_800);
  });
  it('a refund event on an order that is still in escrow cancels it and returns the money', async () => {
    const o = await newOrder();
    await paid(o);
    expect((await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_refund', type: 'refund.succeeded', orderId: o.id, amountCents: 10_000 }))).status).toBe('applied');
    expect((await getOrder(o.id))!.state).toBe('cancelled');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(0);
  });
  it('a refund event on an accepted order is ignored (a dispute decides that)', async () => {
    const o = await newOrder();
    await paid(o);
    await deliver(o.id, 'seller-x');
    await accept(o.id, null);
    expect((await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_late_refund', type: 'refund.succeeded', orderId: o.id }))).status).toBe('ignored');
  });
});

describe('a lost chargeback', () => {
  it('is recorded, counted and alerted once, whatever the order state, and a repeat of the event does nothing', async () => {
    const o = await createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'live_site',
      title: 'Chargeback test',
      lines: [['Site', 10_000]],
      days: 1,
      buyerId: 'cb-buyer-1',
      sellerId: 'cb-seller-1',
      demo: false,
    });
    await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_cb_pay', type: 'payment.succeeded', orderId: o.id, amountCents: 10_000 }));
    const before = (await series(1))[0].values.refunds;
    const first = await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_cb_1', type: 'chargeback.lost', orderId: o.id, amountCents: 10_000 }));
    expect(first.status).toBe('applied');
    expect((await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_cb_1', type: 'chargeback.lost', orderId: o.id, amountCents: 10_000 }))).status).toBe('duplicate');
    expect((await series(1))[0].values.refunds).toBe(before + 1);
    expect((await auditList(300)).filter((e) => e.action === 'chargeback_lost' && e.targetRef === o.id)).toHaveLength(1);
    expect((await handlePaymentEvent('verified-test-psp', ev({ id: 'evt_cb_2', type: 'chargeback.lost', orderId: '11111111-1111-4111-8111-111111111111' }))).status).toBe('rejected');
  });
});
