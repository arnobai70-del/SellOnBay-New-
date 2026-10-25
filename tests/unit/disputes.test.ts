import { describe, expect, it } from 'vitest';
import { CONFIG, DAY_MS, HOUR_MS } from '@/lib/config';
import { adminOverdue, addEvidenceTo, decide, disputeWindow, disputesForOrder, evidenceOf, openDispute, rejectedCount, sellerOverdue, sellerReply } from '@/lib/disputes';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder, orderEvents, runDueJobs } from '@/lib/orders/service';

let n = 0;
const GOOD = 'The page loads blank and the contact form throws an error on submit, see steps.';
/* A paid order of $100 (fee 15%, seller earns $85), delivered or accepted. */
const order = async (to: 'delivered' | 'accepted', buyerId: string | null = null) => {
  const k = ++n;
  buyerId ??= `buyer-d${k}`;
  const sellerId = `seller-d${k}`;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'live_site',
    title: 'Site',
    lines: [['Site', 10_000]],
    days: 2,
    buyerId,
    sellerId,
    productKey: 'saffron-table',
    demo: false,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  await deliver(o.id, sellerId);
  if (to === 'accepted') await accept(o.id, buyerId);
  return (await getOrder(o.id))!;
};
const bal = async (a: string) => (await ledgerStore()).balance(a);

describe('opening a dispute', () => {
  it('needs a reason from the list and real evidence, and keeps contact details out', async () => {
    const o = await order('delivered');
    const bad = async (reason: string, detail: string) => (await openDispute(o.id, o.buyerId, { reason, detail })).ok;
    expect(await bad('banana', GOOD)).toBe(false);
    expect(await bad('not_working', 'broken')).toBe(false);
    expect(await bad('not_working', 'It is broken, write to me at buyer@example.com to sort it out')).toBe(false);
    expect(await bad('not_working', 'It is broken, pay me back on whatsapp please, it does not work at all')).toBe(false);
    expect((await getOrder(o.id))!.state).toBe('delivered');
  });
  it('only during the review window or the 7 days after accepting; not on an unpaid, funded or finished order', async () => {
    const d = await order('delivered');
    expect(disputeWindow(d, d.reviewEndsAt! - 1)).toBe('delivered');
    expect(disputeWindow(d, d.reviewEndsAt! + 1)).toBeNull();
    const a = await order('accepted');
    expect(disputeWindow(a, a.bugfixUntil! - 1)).toBe('accepted');
    expect(disputeWindow(a, a.bugfixUntil! + 1)).toBeNull();
    expect((await openDispute(a.id, a.buyerId, { reason: 'not_working', detail: GOOD }, a.bugfixUntil! + DAY_MS)).ok).toBe(false);
    const funded = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'S', lines: [['S', 1000]], days: 1, buyerId: 'b', sellerId: 's', demo: false });
    expect((await openDispute(funded.id, 'b', { reason: 'not_working', detail: GOOD })).ok).toBe(false);
  });
  it('holds the order: it is disputed, never auto-accepted, never paid out; sets the 48 hour and 5 day clocks', async () => {
    const o = await order('delivered');
    const r = await openDispute(o.id, o.buyerId, { reason: 'not_working', detail: GOOD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sellerDueAt - r.value.createdAt).toBe(CONFIG.dispute.sellerReplyHours * HOUR_MS);
    expect(r.value.adminDueAt - r.value.createdAt).toBe(CONFIG.dispute.adminDecisionDays * DAY_MS);
    expect((await getOrder(o.id))!.state).toBe('disputed');
    await runDueJobs(Date.now() + 60 * DAY_MS);
    expect((await getOrder(o.id))!.state).toBe('disputed');
    expect(await bal(acct.escrow(o.id))).toBe(10_000); // still held
    expect((await orderEvents(o.id)).map((e) => e.event)).toContain('dispute_opened');
    expect((await evidenceOf(r.value.id))[0].text).toBe(GOOD);
  });
  it('one dispute at a time for an order', async () => {
    const o = await order('delivered');
    await openDispute(o.id, o.buyerId, { reason: 'not_working', detail: GOOD });
    expect((await openDispute(o.id, o.buyerId, { reason: 'malware', detail: GOOD })).ok).toBe(false);
    expect(await disputesForOrder(o.id)).toHaveLength(1);
  });
});

describe('evidence and the seller reply', () => {
  it('both sides add evidence; the seller reply is recorded and the overdue flags follow the clocks', async () => {
    const o = await order('delivered');
    const d = (await openDispute(o.id, o.buyerId, { reason: 'not_as_described', detail: GOOD }))!;
    if (!d.ok) throw new Error('open');
    expect(sellerOverdue(d.value, d.value.sellerDueAt + 1)).toBe(true);
    expect(sellerOverdue(d.value, d.value.sellerDueAt - 1)).toBe(false);
    expect((await addEvidenceTo(d.value.id, o.buyerId, 'On the second screen the Send button does nothing, the console shows a 500 error.')).ok).toBe(true);
    expect((await addEvidenceTo(d.value.id, o.buyerId, 'call me 555 123 4567')).ok).toBe(false);
    const r = await sellerReply(d.value.id, o.sellerId, 'It works on my side, here is a video of the form sending correctly.');
    expect(r.ok && r.value.status).toBe('seller_replied');
    expect(sellerOverdue(r.ok ? r.value : d.value, d.value.sellerDueAt + 1)).toBe(false);
    expect(adminOverdue(d.value, d.value.adminDueAt + 1)).toBe(true);
    expect((await evidenceOf(d.value.id)).length).toBe(3);
  });
});

describe('the admin decides', () => {
  const dispute = async (to: 'delivered' | 'accepted') => {
    const o = await order(to);
    const r = await openDispute(o.id, o.buyerId, { reason: 'not_working', detail: GOOD });
    if (!r.ok) throw new Error(r.error);
    return { o, d: r.value };
  };
  it('full refund while it is still in escrow: everything goes back, the seller gets nothing', async () => {
    const { o, d } = await dispute('delivered');
    const r = await decide(d.id, 'admin-1', { decision: 'refund_full' });
    expect(r.ok && r.value.order.state).toBe('refunded');
    expect(await bal(acct.escrow(o.id))).toBe(0);
    expect(await bal(acct.pending(o.sellerId!))).toBe(0);
  });
  it('full refund after the order was accepted: the release is reversed, no money is left with the seller or the platform', async () => {
    const { o, d } = await dispute('accepted');
    expect(await bal(acct.pending(o.sellerId!))).toBe(7_800);
    const r = await decide(d.id, 'admin-1', { decision: 'refund_full' });
    expect(r.ok && r.value.order.state).toBe('refunded');
    expect(await bal(acct.pending(o.sellerId!))).toBe(0);
    const L = await ledgerStore();
    expect(await L.balance(acct.escrow(o.id))).toBe(0);
  });
  it('partial refund is taken from the seller share and the rest is released; too much is refused', async () => {
    const { o, d } = await dispute('delivered');
    expect((await decide(d.id, 'admin-1', { decision: 'refund_partial', refundCents: 7_801 })).ok).toBe(false); // more than the seller earns
    expect((await decide(d.id, 'admin-1', { decision: 'refund_partial', refundCents: 0 })).ok).toBe(false);
    expect((await decide(d.id, 'admin-1', { decision: 'refund_partial', refundCents: 10.5 })).ok).toBe(false);
    const r = await decide(d.id, 'admin-1', { decision: 'refund_partial', refundCents: 2_000 });
    expect(r.ok && r.value.order.state).toBe('accepted');
    expect(r.ok && r.value.order.refundedCents).toBe(2_000);
    expect(await bal(acct.escrow(o.id))).toBe(0);
    expect(await bal(acct.pending(o.sellerId!))).toBe(5_800); // 78.00 - 20.00
    expect(await bal(acct.revenue)).toBeGreaterThanOrEqual(2_200);
    // after the hold the seller is paid what is left
    await runDueJobs(Date.now() + 9 * DAY_MS);
    expect(await bal(acct.available(o.sellerId!))).toBe(5_800);
  });
  it('ask the seller to fix: the order goes back to the seller, who delivers again and a new review window opens', async () => {
    const { o, d } = await dispute('delivered');
    const r = await decide(d.id, 'admin-1', { decision: 'fix_requested' });
    expect(r.ok && r.value.order.state).toBe('fix_requested');
    expect((await deliver(o.id, o.sellerId)).ok).toBe(true);
    const again = (await getOrder(o.id))!;
    expect(again.state).toBe('delivered');
    expect(again.reviewEndsAt!).toBeGreaterThan(Date.now());
  });
  it('release: the dispute is rejected and the seller is paid as normal; three rejections flag the buyer', async () => {
    const buyer = 'serial-disputer';
    for (let i = 0; i < 3; i++) {
      const o = await order('delivered', buyer);
      const d = await openDispute(o.id, buyer, { reason: 'other', detail: GOOD });
      if (!d.ok) throw new Error(d.error);
      const r = await decide(d.value.id, 'admin-1', { decision: 'release', note: 'Works as described.' });
      expect(r.ok && r.value.order.state).toBe('accepted');
      expect(await bal(acct.pending(o.sellerId!))).toBe(7_800);
      expect(rejectedCount(buyer)).toBe(i + 1);
    }
  });
  it('a dispute is decided once, and a decision note cannot carry contact details', async () => {
    const { d } = await dispute('delivered');
    expect((await decide(d.id, 'admin-1', { decision: 'release', note: 'write to me at a@b.com' })).ok).toBe(false);
    expect((await decide(d.id, 'admin-1', { decision: 'release' })).ok).toBe(true);
    expect((await decide(d.id, 'admin-1', { decision: 'refund_full' })).ok).toBe(false);
  });
  it('the decision and who made it are in the order history', async () => {
    const { o, d } = await dispute('delivered');
    await decide(d.id, 'admin-7', { decision: 'refund_full', note: 'Confirmed broken.' });
    const ev = (await orderEvents(o.id)).find((e) => e.event === 'dispute_decided')!;
    expect(ev.actorId).toBe('admin-7');
    expect(ev.meta).toMatchObject({ decision: 'refund_full', note: 'Confirmed broken.' });
  });
});
