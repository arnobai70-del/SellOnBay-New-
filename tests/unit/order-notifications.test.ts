import { describe, expect, it } from 'vitest';
import { HOUR_MS } from '@/lib/config';
import { notificationsFor } from '@/lib/notify';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder, runDueJobs } from '@/lib/orders/service';
import { createExtra } from '@/lib/orders/extra';
import { openDispute, sellerReply } from '@/lib/disputes';

let n = 0;
const kinds = async (u: string) => (await notificationsFor(u)).map((x) => x.kind);
const funded = async () => {
  const k = ++n;
  const buyer = `nb-${k}`,
    seller = `ns-${k}`;
  const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Saffron Table', lines: [['Site', 10_000]], days: 1, buyerId: buyer, sellerId: seller, demo: false });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_n' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  return { o: (await getOrder(o.id))!, buyer, seller };
};

describe('who is told when an order changes', () => {
  it('funded: both; delivered: the buyer; accepted: the seller', async () => {
    const { o, buyer, seller } = await funded();
    expect(await kinds(buyer)).toEqual(['order_funded']);
    expect(await kinds(seller)).toEqual(['order_funded']);
    await deliver(o.id, seller);
    expect(await kinds(buyer)).toContain('order_delivered');
    expect(await kinds(seller)).not.toContain('order_delivered');
    await accept(o.id, buyer);
    expect(await kinds(seller)).toContain('order_accepted');
  });
  it('the deadline passing tells both that the order is late', async () => {
    const { o, buyer, seller } = await funded();
    await runDueJobs(o.dueAt! + HOUR_MS);
    expect(await kinds(buyer)).toContain('order_overdue');
    expect(await kinds(seller)).toContain('order_overdue');
  });
  it('a reminder 6 hours before delivery is due goes to the seller once, however often the job runs', async () => {
    const { o, buyer, seller } = await funded();
    await runDueJobs(o.dueAt! - 7 * HOUR_MS);
    expect(await kinds(seller)).not.toContain('order_due_soon');
    await runDueJobs(o.dueAt! - 5 * HOUR_MS);
    await runDueJobs(o.dueAt! - 4 * HOUR_MS);
    expect((await kinds(seller)).filter((k) => k === 'order_due_soon')).toHaveLength(1);
    expect(await kinds(buyer)).not.toContain('order_due_soon');
  });
  it('a reminder 12 hours before the review ends goes to the buyer once', async () => {
    const { o, buyer, seller } = await funded();
    await deliver(o.id, seller);
    const d = (await getOrder(o.id))!;
    await runDueJobs(d.reviewEndsAt! - 13 * HOUR_MS);
    expect(await kinds(buyer)).not.toContain('review_ending');
    await runDueJobs(d.reviewEndsAt! - 11 * HOUR_MS);
    await runDueJobs(d.reviewEndsAt! - 10 * HOUR_MS);
    expect((await kinds(buyer)).filter((k) => k === 'review_ending')).toHaveLength(1);
  });
  it('extra work: the buyer is asked; a dispute: the seller is told, and the buyer hears the reply', async () => {
    const { o, buyer, seller } = await funded();
    await createExtra(o.id, seller, { title: 'Add a gallery page', priceCents: 2500, addDays: 1 });
    expect(await kinds(buyer)).toContain('extra_work_request');
    await deliver(o.id, seller);
    const d = await openDispute(o.id, buyer, { reason: 'not_working', detail: 'The form on the contact page throws an error every time.' });
    if (!d.ok) throw new Error(d.error);
    expect(await kinds(seller)).toContain('dispute_opened');
    await sellerReply(d.value.id, seller, 'I checked it and the form works, here is what I did to test it.');
    expect(await kinds(buyer)).toContain('dispute_reply');
  });
});
