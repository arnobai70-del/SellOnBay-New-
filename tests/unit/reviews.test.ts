import { describe, expect, it } from 'vitest';
import { addReview, canReview, ratingOf, reviewOfOrder, reviewsFor } from '@/lib/reviews';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder } from '@/lib/orders/service';

let n = 0;
const order = async (productKey: string, to: 'funded' | 'delivered' | 'accepted', kind: 'product' | 'custom' = 'product') => {
  const k = ++n;
  const o = await createOrder({ kind, pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 5000]], days: 1, buyerId: `rv-b${k}`, sellerId: `rv-s${k}`, productKey, demo: false });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  if (to !== 'funded') await deliver(o.id, `rv-s${k}`);
  if (to === 'accepted') await accept(o.id, `rv-b${k}`);
  return (await getOrder(o.id))!;
};

describe('reviews', () => {
  it('only the buyer of an accepted product order can review', async () => {
    const funded = await order('rv-prod-a', 'funded');
    const delivered = await order('rv-prod-a', 'delivered');
    const custom = await order('rv-prod-a', 'accepted', 'custom');
    for (const o of [funded, delivered, custom]) expect(canReview(o)).toBe(false);
    expect((await addReview(delivered.id, delivered.buyerId, { rating: 5, body: 'great' })).ok).toBe(false);
    expect((await addReview(custom.id, custom.buyerId, { rating: 5, body: 'great' })).ok).toBe(false);
    expect((await addReview('00000000-0000-4000-8000-000000000000', 'x', { rating: 5, body: '' })).ok).toBe(false);
    expect(await ratingOf('rv-prod-a')).toEqual({ avg: 0, count: 0 });
  });
  it('one review per order, 1 to 5 stars, a short note without contact details or links', async () => {
    const o = await order('rv-prod-b', 'accepted');
    expect(canReview(o)).toBe(true);
    for (const rating of [0, 6, 3.5]) expect((await addReview(o.id, o.buyerId, { rating, body: '' })).ok, String(rating)).toBe(false);
    expect((await addReview(o.id, o.buyerId, { rating: 5, body: 'Mail me at a@b.com for a discount' })).ok).toBe(false);
    expect((await addReview(o.id, o.buyerId, { rating: 5, body: 'Visit https://spam.example for more' })).ok).toBe(false);
    expect((await addReview(o.id, o.buyerId, { rating: 5, body: 'x'.repeat(1001) })).ok).toBe(false);
    expect((await addReview(o.id, o.buyerId, { rating: 4, body: 'Works well, easy to set up.' })).ok).toBe(true);
    expect((await addReview(o.id, o.buyerId, { rating: 1, body: 'Changed my mind' })).ok).toBe(false); // only once
    expect((await reviewOfOrder(o.id))?.rating).toBe(4);
  });
  it('the rating is the real average, to one decimal, newest first', async () => {
    const key = 'rv-prod-c';
    for (const r of [5, 4, 4]) {
      const o = await order(key, 'accepted');
      await addReview(o.id, o.buyerId, { rating: r, body: `rated ${r}` });
    }
    expect(await ratingOf(key)).toEqual({ avg: 4.3, count: 3 });
    const list = await reviewsFor(key);
    expect(list).toHaveLength(3);
    expect(list[0].at).toBeGreaterThanOrEqual(list[2].at);
    expect(list.every((x) => x.who === 'Verified buyer')).toBe(true);
    expect(await ratingOf('rv-prod-other')).toEqual({ avg: 0, count: 0 });
  });
});
