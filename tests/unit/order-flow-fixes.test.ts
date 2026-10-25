import { describe, expect, it } from 'vitest';
import { CONFIG, DAY_MS } from '@/lib/config';
import { createExtra } from '@/lib/orders/extra';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { createOrder, deliver, getOrder, handoverSent, orderEvents, refundAtProvider, runDueJobs } from '@/lib/orders/service';
import { fakePayments } from '@/lib/providers/payment';

/* Order paths found wrong in a review: repository orders, extra work during the review, and payment events that do not fit the order. */
let n = 0;
const paid = async (deliveryType: 'live_site' | 'repo_access' = 'live_site') => {
  const sellerId = `of-seller-${Date.now()}-${++n}`;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType,
    title: 'Site',
    lines: [['Site', 10_000]],
    days: 2,
    buyerId: null,
    sellerId,
    productKey: 'saffron-table',
    demo: false,
    githubUsername: deliveryType === 'repo_access' ? 'octocat' : undefined,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'pay_' + o.id, at: Date.now() });
  return (await getOrder(o.id))!;
};

describe('order flow fixes', () => {
  it('a repository order with the invite sent never turns overdue (the buyer already has the code), it is confirmed instead', async () => {
    const o = await paid('repo_access');
    expect((await handoverSent(o.id, o.sellerId)).ok).toBe(true);
    await runDueJobs(Date.now() + 10 * DAY_MS);
    expect((await getOrder(o.id))!.state).toBe('delivered');
  });

  it('a repository order counts as confirmed 10 days after the invite, and the review starts', async () => {
    const o = await paid('repo_access');
    const t0 = Date.now();
    const days = CONFIG.repo.autoConfirmDays;
    expect((await handoverSent(o.id, o.sellerId)).ok).toBe(true);
    await runDueJobs(t0 + (days - 1) * DAY_MS);
    expect((await getOrder(o.id))!.state).toBe('in_delivery');
    await runDueJobs(t0 + days * DAY_MS + 60_000);
    const after = (await getOrder(o.id))!;
    expect(after.state).toBe('delivered');
    expect(after.reviewEndsAt).toBeGreaterThan(t0 + days * DAY_MS);
    expect((await orderEvents(o.id)).some((e) => e.event === 'access_auto_confirmed')).toBe(true);
  });

  it('extra work costs $5 to $500', async () => {
    const o = await paid();
    const ask = (priceCents: number) => createExtra(o.id, o.sellerId, { title: 'Add a gallery page', priceCents, addDays: 1 });
    expect((await ask(50_000)).ok).toBe(true);
    expect((await ask(50_001)).ok).toBe(false);
  });

  it('a site order still turns overdue', async () => {
    const o = await paid();
    await runDueJobs(Date.now() + 10 * DAY_MS);
    expect((await getOrder(o.id))!.state).toBe('overdue');
  });

  it('no extra work while the buyer reviews a delivery', async () => {
    const o = await paid();
    await deliver(o.id, o.sellerId);
    const r = await createExtra(o.id, o.sellerId, { title: 'Add a gallery page', priceCents: 2_500, addDays: 2 });
    expect(r.ok).toBe(false);
  });

  it("an extra-work payment that names another order's extra is rejected", async () => {
    const a = await paid();
    const b = await paid();
    const r = await createExtra(b.id, b.sellerId, { title: 'Add a gallery page', priceCents: 2_500, addDays: 2 });
    if (!r.ok) throw new Error(r.error);
    const out = await handlePaymentEvent('verified-test-psp', {
      id: 'evt_cross_' + r.request.id,
      type: 'payment.succeeded',
      orderId: a.id,
      amountCents: 2_500,
      ref: 'pay_cross',
      at: Date.now(),
      changeRequestId: r.request.id,
    });
    expect(out.status).toBe('rejected');
  });

  it('a partial refund at the provider does not cancel the order', async () => {
    const o = await paid();
    const out = await handlePaymentEvent('verified-test-psp', { id: 'evt_pr_' + o.id, type: 'refund.succeeded', orderId: o.id, amountCents: 500, ref: 're_' + o.id, at: Date.now() });
    expect(out.status).toBe('ignored');
    expect((await getOrder(o.id))!.state).toBe('funded');
    const full = await handlePaymentEvent('verified-test-psp', { id: 'evt_fr_' + o.id, type: 'refund.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 're2_' + o.id, at: Date.now() });
    expect(full.status).toBe('applied');
    expect((await getOrder(o.id))!.state).toBe('cancelled');
  });

  it('a refund at the provider covers the price and funded extra work, less what was refunded already', async () => {
    const o = await paid();
    const r = await createExtra(o.id, o.sellerId, { title: 'Add a gallery page', priceCents: 2_500, addDays: 2 });
    if (!r.ok) throw new Error(r.error);
    await handlePaymentEvent('verified-test-psp', {
      id: 'evt_x_' + r.request.id,
      type: 'payment.succeeded',
      orderId: o.id,
      amountCents: 2_500,
      ref: 'pay_x_' + o.id,
      at: Date.now(),
      changeRequestId: r.request.id,
    });
    const fresh = (await getOrder(o.id))!;
    expect(await refundAtProvider(fresh)).toBe(12_500);
    expect(fakePayments.calls.at(-1)).toEqual({ method: 'refund', args: [o.id, 12_500] });
    expect(await refundAtProvider({ ...fresh, refundedCents: 4_000 })).toBe(8_500);
    expect(await refundAtProvider({ ...fresh, refundedCents: 12_500 })).toBe(0);
  });
});

describe('cancel notices', () => {
  it('a paid order that is cancelled tells both sides; an unpaid one tells nobody', async () => {
    const { cancel } = await import('@/lib/orders/service');
    const { notificationsFor } = await import('@/lib/notify');
    const buyerId = `cn-buyer-${Date.now()}`;
    const sellerId = `cn-seller-${Date.now()}`;
    const make = () =>
      createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 2, buyerId, sellerId, productKey: 'saffron-table', demo: false });
    const unpaid = await make();
    await cancel(unpaid.id, buyerId, 'buyer cancelled before paying');
    expect((await notificationsFor(sellerId)).some((x) => x.kind === 'order_cancelled')).toBe(false);
    const o = await make();
    await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'pay_' + o.id, at: Date.now() });
    await cancel(o.id, null, 'safety check');
    expect((await notificationsFor(buyerId)).filter((x) => x.kind === 'order_cancelled')).toHaveLength(1);
    expect((await notificationsFor(sellerId)).filter((x) => x.kind === 'order_cancelled')).toHaveLength(1);
  });
});
