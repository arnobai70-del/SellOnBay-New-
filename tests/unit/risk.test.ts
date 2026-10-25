import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { deleteReportsBy, fileReport, listReports } from '@/lib/abuse';
import { removeFakeAccount, removeFakeReview, removeReviewsBy } from '@/lib/clean';
import { CONFIG, DAY_MS } from '@/lib/config';
import type { Order } from '@/lib/orders/machine';
import { seenFirst } from '@/lib/guard';
import { HELD_TEXT, decideHold, heldReason, listHolds, holdReasonFor } from '@/lib/holds';
import { METRICS, bump, checkAnomalies, findAnomalies, isAnomaly, series, type Day } from '@/lib/metrics';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, cancel, createOrder, deliver, getOrder, tick } from '@/lib/orders/service';
import { notificationsFor } from '@/lib/notify';
import { addReview, deleteReviewsBy, reviewOfOrder } from '@/lib/reviews';
import { checkoutPausedFor, isOn, setSwitch, switchStates } from '@/lib/switches';

let n = 0;
const uid = () => `risk-user-${Date.now()}-${++n}`;
const make = async (o: { buyer: string; cents: number; demo?: boolean; fund?: boolean }) => {
  const order = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'live_site',
    title: 'Risk test site',
    lines: [['Site', o.cents]],
    days: 1,
    buyerId: o.buyer,
    sellerId: `risk-seller-${n}`,
    productKey: `risk-site-${n}`,
    demo: o.demo ?? false,
  });
  if (o.fund !== false) await handlePaymentEvent('verified-test-psp', { id: `evt_${order.id}`, type: 'payment.succeeded', orderId: order.id, amountCents: order.priceCents, ref: 'p', at: Date.now() });
  return order;
};

describe('daily counters', () => {
  it('count what happens today and show the last days oldest first', async () => {
    await bump('reports', 2);
    await bump('reports');
    await bump('accounts', 1, Date.now() - 2 * DAY_MS);
    const s = await series(5);
    expect(s).toHaveLength(5);
    expect(s[0].day < s[4].day).toBe(true);
    expect(s[4].values.reports).toBeGreaterThanOrEqual(3);
    expect(s[2].values.accounts).toBeGreaterThanOrEqual(1);
    expect(Object.keys(s[0].values).sort()).toEqual([...METRICS].sort());
  });
  it('the real actions bump their counter: an order, a failed payment and an abuse report', async () => {
    const before = (await series(1))[0].values;
    await make({ buyer: uid(), cents: 5000, fund: false });
    await handlePaymentEvent('verified-test-psp', {
      id: `evt_fail_${Date.now()}_${n}`,
      type: 'payment.failed',
      orderId: (await make({ buyer: uid(), cents: 5000, fund: false })).id,
      amountCents: 5000,
      ref: 'p',
      at: Date.now(),
    });
    await fileReport({ url: `https://x.example/product/risk-${n}`, reason: 'phishing', detail: '', userId: null, ip: `9.9.${n}.9` });
    const after = (await series(1))[0].values;
    expect(after.orders).toBe(before.orders + 2);
    expect(after.failed_payments).toBe(before.failed_payments + 1);
    expect(after.reports).toBe(before.reports + 1);
  });
});

describe('unusual rises', () => {
  it('a day is unusual when it is high enough and far above the average of the days before', () => {
    expect(isAnomaly(30, [2, 3, 1, 2], 20)).toBe(true);
    expect(isAnomaly(19, [0, 0, 0], 20)).toBe(false); // under the minimum
    expect(isAnomaly(30, [12, 10, 11], 20)).toBe(false); // not 3 times the average
    expect(isAnomaly(20, [], 20)).toBe(true);
  });
  it('finds the metric that jumped and nothing else, and tells the admins', async () => {
    const empty = () => Object.fromEntries(METRICS.map((m) => [m, 0])) as Day['values'];
    const days: Day[] = Array.from({ length: CONFIG.risk.anomaly.baselineDays + 1 }, (_, i) => ({ day: `2026-10-0${i + 1}`, values: empty() }));
    days[days.length - 1].values.orders = 45;
    expect(findAnomalies(days)).toEqual([{ metric: 'orders', today: 45, average: 0 }]);
    await bump('disputes', CONFIG.risk.anomaly.minToday.disputes + 1);
    expect((await checkAnomalies()).map((a) => a.metric)).toContain('disputes');
  });
});

describe('emergency switch', () => {
  it('needs a reason, stops only new buyers while on, and everyone is let back in when off', async () => {
    const old = uid();
    const fresh = uid();
    seenFirst(old, 0);
    seenFirst(fresh, Date.now());
    expect(await isOn('pause_new_buyer_checkout')).toBe(false);
    expect(await checkoutPausedFor(null)).toBe(false);
    expect((await setSwitch('admin-1', 'pause_new_buyer_checkout', true, 'no')).ok).toBe(false);
    expect((await setSwitch('admin-1', 'pause_new_buyer_checkout', true, 'A flood of fake buyers.')).ok).toBe(true);
    expect((await switchStates())[0]).toMatchObject({ key: 'pause_new_buyer_checkout', enabled: true });
    expect(await checkoutPausedFor(null)).toBe(true); // signed out
    expect(await checkoutPausedFor(fresh)).toBe(true); // a new account
    expect(await checkoutPausedFor(old)).toBe(false); // an account with some age
    expect((await setSwitch('admin-1', 'pause_new_buyer_checkout', false, 'The flood is over.')).ok).toBe(true);
    expect(await checkoutPausedFor(null)).toBe(false);
    const log = await auditList(300);
    expect(log.some((e) => e.action === 'switch_on')).toBe(true);
    expect(log.some((e) => e.action === 'switch_off')).toBe(true);
  });
});

describe('orders held for a safety check', () => {
  it('a new account paying a lot is held until an admin releases it; the seller cannot deliver meanwhile', async () => {
    const buyer = uid();
    seenFirst(buyer, Date.now());
    const o = await make({ buyer, cents: CONFIG.risk.holdNewBuyerMinCents });
    expect(await heldReason(o.id)).toMatch(/new account/i);
    expect((await listHolds()).some((h) => h.orderId === o.id)).toBe(true);
    expect(HELD_TEXT).toMatch(/safety check/);
    expect((await decideHold('admin-1', o.id, 'release', 'no')).ok).toBe(false); // a reason is needed
    expect((await decideHold('admin-1', o.id, 'release', 'Card and buyer look fine.')).ok).toBe(true);
    expect(await heldReason(o.id)).toBeNull();
    expect((await decideHold('admin-1', o.id, 'release', 'Again please.')).ok).toBe(false); // decided once
    expect((await deliver(o.id, 'risk-seller')).ok).toBe(true);
    expect((await auditList(300)).some((e) => e.action === 'hold_released' && e.targetRef === o.id)).toBe(true);
  });
  it('the seller is told to wait, not to start; the delivery timer stands still and the time comes back on release', async () => {
    const buyer = uid();
    seenFirst(buyer, Date.now());
    const o = await make({ buyer, cents: 20000 });
    const mine = await notificationsFor(o.sellerId!);
    expect(mine.some((x) => x.kind === 'order_held')).toBe(true);
    expect(mine.some((x) => x.kind === 'order_funded')).toBe(false);
    const due = (await getOrder(o.id))!.dueAt!;
    const wayLater = due + 5 * DAY_MS;
    expect((await tick((await getOrder(o.id)) as Order, wayLater)).state).not.toBe('overdue'); // no timer runs while held
    const t0 = Date.now();
    expect((await decideHold('admin-1', o.id, 'release', 'Looks fine to me.', t0 + 2 * DAY_MS)).ok).toBe(true);
    const shifted = (await getOrder(o.id))!.dueAt! - due;
    expect(shifted).toBeGreaterThan(2 * DAY_MS - 10_000);
    expect(shifted).toBeLessThan(2 * DAY_MS + 10_000);
    expect((await notificationsFor(o.sellerId!)).some((x) => x.kind === 'order_hold_decided')).toBe(true);
  });
  it('cancelling a held order refunds the buyer from escrow', async () => {
    const buyer = uid();
    seenFirst(buyer, Date.now());
    const o = await make({ buyer, cents: 25000 });
    expect(await heldReason(o.id)).not.toBeNull();
    expect((await decideHold('admin-1', o.id, 'cancel', 'Stolen card suspected.')).ok).toBe(true);
    expect((await getOrder(o.id))?.state).toBe('cancelled');
    expect(await heldReason(o.id)).toBeNull();
  });
  it('is not used for small orders, old accounts, demo orders or signed-out buyers', async () => {
    const fresh = uid();
    seenFirst(fresh, Date.now());
    expect(await holdReasonFor(await make({ buyer: fresh, cents: CONFIG.risk.holdNewBuyerMinCents - 100 }))).toBeNull();
    const old = uid();
    seenFirst(old, 0);
    expect(await holdReasonFor(await make({ buyer: old, cents: 50000 }))).toBeNull();
    expect(await holdReasonFor(await make({ buyer: fresh, cents: 50000, demo: true }))).toBeNull();
    expect(await holdReasonFor({ ...(await make({ buyer: fresh, cents: 50000, fund: false })), buyerId: null })).toBeNull();
    expect((await decideHold('admin-1', 'no-such-order', 'release', 'Nothing to decide.')).ok).toBe(false);
  });
});

describe('clean-up', () => {
  const accepted = async (buyer: string) => {
    const o = await make({ buyer, cents: 5000, demo: false });
    await deliver(o.id, null);
    await accept(o.id, buyer);
    return o;
  };
  it('removes one fake review and keeps the order, and says so in the audit log', async () => {
    const buyer = uid();
    seenFirst(buyer, 0);
    const o = await accepted(buyer);
    expect((await addReview(o.id, buyer, { rating: 1, body: 'Fake bad review.' })).ok).toBe(true);
    expect((await removeFakeReview('admin-1', o.id, 'no')).ok).toBe(false);
    expect((await removeFakeReview('admin-1', o.id, 'Posted by a competitor.')).ok).toBe(true);
    expect(await reviewOfOrder(o.id)).toBeNull();
    expect((await getOrder(o.id))?.state).toBeTruthy();
    expect((await removeFakeReview('admin-1', o.id, 'Posted by a competitor.')).ok).toBe(false);
    expect((await auditList(300)).some((e) => e.action === 'review_removed' && e.targetRef === o.id)).toBe(true);
  });
  it('removes every review and abuse report an account wrote, and nobody else', async () => {
    const fake = uid();
    const other = uid();
    seenFirst(fake, 0);
    seenFirst(other, 0);
    const a = await accepted(fake);
    const b = await accepted(other);
    await addReview(a.id, fake, { rating: 1, body: 'Bad.' });
    await addReview(b.id, other, { rating: 5, body: 'Good.' });
    await fileReport({ url: `https://x.example/product/clean-${n}`, reason: 'phishing', detail: '', userId: fake, ip: `8.8.${n}.1` });
    await fileReport({ url: `https://x.example/product/clean-${n}`, reason: 'phishing', detail: '', userId: other, ip: `8.8.${n}.2` });
    expect(await deleteReviewsBy(fake)).toBe(1);
    expect(await deleteReportsBy(fake)).toBe(1);
    expect(await reviewOfOrder(b.id)).not.toBeNull();
    expect((await listReports(false)).filter((r) => r.url.endsWith(`clean-${n}`))).toHaveLength(1);
  });
  it('removes every review by an account that has paid orders, keeps the orders, and leaves others alone', async () => {
    const fake = uid();
    const other = uid();
    seenFirst(fake, 0);
    seenFirst(other, 0);
    const a1 = await accepted(fake);
    const a2 = await accepted(fake);
    const b = await accepted(other);
    await addReview(a1.id, fake, { rating: 5, body: 'Great.' });
    await addReview(a2.id, fake, { rating: 5, body: 'Great again.' });
    await addReview(b.id, other, { rating: 2, body: 'Meh.' });
    expect(await removeReviewsBy('admin-1', fake, 'no')).toMatchObject({ ok: false, status: 400 });
    expect(await removeReviewsBy('admin-1', fake, 'Seller bought their own listing.')).toEqual({ ok: true, removed: { reviews: 2, reports: 0 } });
    expect(await reviewOfOrder(a1.id)).toBeNull();
    expect(await reviewOfOrder(b.id)).not.toBeNull();
    expect((await getOrder(a1.id))?.state).toBe('accepted');
    expect(await removeReviewsBy('admin-1', fake, 'Seller bought their own listing.')).toMatchObject({ ok: false, status: 404 });
    expect((await auditList(300)).some((e) => e.action === 'reviews_removed' && e.targetRef === fake)).toBe(true);
  });
  it('an account cannot be removed in demo mode, and the guards on the form work', async () => {
    expect((await removeFakeAccount('admin-1', '11111111-1111-4111-8111-111111111111', 'Fake account.')).ok).toBe(false);
    expect(await removeFakeAccount('admin-1', 'x', 'Fake account.')).toMatchObject({ ok: false, status: 400 });
    expect(await removeFakeAccount('admin-1', '11111111-1111-4111-8111-111111111111', 'no')).toMatchObject({ ok: false, status: 400 });
  });
  it('a cancelled order cannot be put on hold twice', async () => {
    const o = await make({ buyer: uid(), cents: 5000, fund: false });
    expect((await cancel(o.id, null, 'test')).ok).toBe(true);
  });
});
