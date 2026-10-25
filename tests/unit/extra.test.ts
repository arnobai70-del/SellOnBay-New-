import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { cancelExtra, createExtra, declineExtra, extrasOf, getExtra } from '@/lib/orders/extra';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, cancel, createOrder, deliver, getOrder, orderEvents, runDueJobs } from '@/lib/orders/service';

let n = 0;
const seller = () => `seller-e${++n}`;
const order = async (sellerId = seller()) => {
  const o = await createOrder({
    kind: 'product',
    pkg: 'setup',
    deliveryType: 'live_site',
    title: 'Site',
    lines: [['Site', 10_000]],
    days: 2,
    buyerId: null,
    sellerId,
    productKey: 'saffron-table',
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'pay_' + o.id, at: Date.now() });
  return (await getOrder(o.id))!;
};
const payExtra = (orderId: string, requestId: string, amountCents: number, id = 'evt_x_' + requestId) =>
  handlePaymentEvent('verified-test-psp', { id, type: 'payment.succeeded', orderId, amountCents, ref: 'pay_' + requestId, at: Date.now(), changeRequestId: requestId });
const ask = async (o: { id: string; sellerId: string | null }, over: Partial<{ title: string; priceCents: number; addDays: number }> = {}) => {
  const r = await createExtra(o.id, o.sellerId, { title: 'Add a gallery page', priceCents: 2_500, addDays: 2, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.request;
};

describe('extra work: what a seller may ask for', () => {
  it('title up to 80 characters, price from $5, 1 to 3 extra days', async () => {
    const o = await order();
    const bad = async (over: object) => (await createExtra(o.id, o.sellerId, { title: 'Add a gallery', priceCents: 500, addDays: 1, ...over })).ok;
    expect(await bad({})).toBe(true);
    expect(await bad({ title: 'x'.repeat(80) })).toBe(true);
    expect(await bad({ title: 'x'.repeat(81) })).toBe(false);
    expect(await bad({ title: 'ab' })).toBe(false);
    expect(await bad({ priceCents: 499 })).toBe(false);
    expect(await bad({ priceCents: 1000.5 })).toBe(false);
    expect(await bad({ addDays: 0 })).toBe(false);
    expect(await bad({ addDays: 4 })).toBe(false);
    expect(await bad({ addDays: 1.5 })).toBe(false);
  });
  it('the chat filter applies to the title', async () => {
    const o = await order();
    const r = await createExtra(o.id, o.sellerId, { title: 'Pay me on whatsapp for this', priceCents: 1000, addDays: 1 });
    expect(r.ok).toBe(false);
    expect((await createExtra(o.id, o.sellerId, { title: 'mail me at a@b.com', priceCents: 1000, addDays: 1 })).ok).toBe(false);
  });
  it('at most three requests wait for the buyer at once', async () => {
    const o = await order();
    for (let i = 0; i < 3; i++) await ask(o);
    expect((await createExtra(o.id, o.sellerId, { title: 'One more', priceCents: 1000, addDays: 1 })).ok).toBe(false);
  });
  it('not on an unpaid order, and not once the order is accepted', async () => {
    const unpaid = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'S', lines: [['S', 1000]], days: 1, buyerId: null, sellerId: 's', demo: false });
    expect((await createExtra(unpaid.id, 's', { title: 'Something', priceCents: 1000, addDays: 1 })).ok).toBe(false);
    const o = await order();
    await deliver(o.id, o.sellerId);
    await accept(o.id, null);
    expect((await createExtra(o.id, o.sellerId, { title: 'Too late', priceCents: 1000, addDays: 1 })).ok).toBe(false);
  });
});

describe('extra work: approve, decline, pay', () => {
  it('approve and pay: the request is funded, the deadline moves out, the money sits in escrow, and it is all in the history', async () => {
    const o = await order();
    const dueBefore = o.dueAt!;
    const c = await ask(o, { priceCents: 2_500, addDays: 2 });
    expect(c.state).toBe('pending');
    expect(await payExtra(o.id, c.id, 2_500)).toEqual({ status: 'applied' });
    expect((await getExtra(c.id))!.state).toBe('funded');
    expect((await getOrder(o.id))!.dueAt).toBe(dueBefore + 2 * DAY_MS);
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(12_500);
    expect((await orderEvents(o.id)).map((e) => e.event)).toEqual(['created', 'funded', 'extra_requested', 'extra_funded']);
    expect((await extrasOf(o.id))[0]).toMatchObject({ title: 'Add a gallery page', priceCents: 2_500, addDays: 2, state: 'funded' });
  });
  it('the same payment event twice, or a second payment for a funded request, changes nothing', async () => {
    const o = await order();
    const c = await ask(o);
    await payExtra(o.id, c.id, 2_500, 'evt_same');
    expect((await payExtra(o.id, c.id, 2_500, 'evt_same')).status).toBe('duplicate');
    expect((await payExtra(o.id, c.id, 2_500, 'evt_other')).status).toBe('ignored');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(12_500);
  });
  it('a payment for the wrong amount is refused and the request stays pending', async () => {
    const o = await order();
    const c = await ask(o);
    expect((await payExtra(o.id, c.id, 100, 'evt_wrong')).status).toBe('rejected');
    expect((await getExtra(c.id))!.state).toBe('pending');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(10_000);
  });
  it('decline: nothing is charged and the deadline does not move; it cannot be paid afterwards', async () => {
    const o = await order();
    const c = await ask(o);
    expect((await declineExtra(c.id, null)).ok).toBe(true);
    expect((await declineExtra(c.id, null)).ok).toBe(false);
    expect((await payExtra(o.id, c.id, 2_500, 'evt_after')).status).toBe('ignored');
    expect((await getOrder(o.id))!.dueAt).toBe(o.dueAt);
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(10_000);
  });
  it('the seller can take back a request that is still waiting, and cannot take back a paid one', async () => {
    const o = await order();
    const a = await ask(o),
      b = await ask(o);
    expect((await cancelExtra(a.id, o.sellerId)).ok).toBe(true);
    await payExtra(o.id, b.id, 2_500);
    expect((await cancelExtra(b.id, o.sellerId)).ok).toBe(false);
  });
});

describe('extra work: money at accept, payout and refund', () => {
  it('on acceptance the extra work is released with the 20% fee from the seller side; after the hold it is available', async () => {
    const sid = seller();
    const o = await order(sid);
    const c = await ask(o, { priceCents: 2_500 });
    await payExtra(o.id, c.id, 2_500);
    await deliver(o.id, sid);
    await accept(o.id, null);
    const L = await ledgerStore();
    expect(await L.balance(acct.escrow(o.id))).toBe(0);
    // base 100.00: fee 22% = 22.00, seller 78.00. extra 25.00: fee 20% = 5.00, seller 20.00
    expect(await L.balance(acct.pending(sid))).toBe(7_800 + 2_000);
    await runDueJobs(Date.now() + 9 * DAY_MS);
    expect(await L.balance(acct.pending(sid))).toBe(0);
    expect(await L.balance(acct.available(sid))).toBe(9_800);
  });
  it('a cancel with extra work paid returns everything that is in escrow, the order and the extra', async () => {
    const o = await order();
    const c = await ask(o, { priceCents: 3_000 });
    await payExtra(o.id, c.id, 3_000);
    expect((await cancel(o.id, null, 'test')).ok).toBe(true);
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(0);
  });
});
