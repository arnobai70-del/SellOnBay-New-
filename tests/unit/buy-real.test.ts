import { describe, expect, it } from 'vitest';
import { dueSteps } from '@/lib/orders/machine';
import { createOrder, getOrder, tick } from '@/lib/orders/service';
import { handlePaymentEvent } from '@/lib/orders/payments';

let n = 0;
const make = async (over: Partial<Parameters<typeof createOrder>[0]> = {}) => {
  const k = ++n;
  const o = await createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'download',
    title: 'Kit',
    lines: [['Kit', 2900]],
    days: 1,
    buyerId: `br-b${k}`,
    sellerId: `br-s${k}`,
    productKey: `br-kit-${k}`,
    productId: `11111111-1111-4111-8111-${String(k).padStart(12, '0')}`,
    instant: true,
    demo: false,
    ...over,
  });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  return o;
};

describe('an order for a seller listing', () => {
  it('keeps the listing and the seller it was made for', async () => {
    const o = await createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      title: 'Kit',
      lines: [['Kit', 2900]],
      days: 1,
      buyerId: 'b',
      sellerId: 's',
      productKey: 'kit',
      productId: 'uuid-1',
      demo: false,
    });
    expect(await getOrder(o.id)).toMatchObject({ sellerId: 's', productId: 'uuid-1', productKey: 'kit', demo: false });
    const starter = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'S', lines: [['S', 1000]], days: 1, buyerId: null, productKey: 'saffron-table' });
    expect(await getOrder(starter.id)).toMatchObject({ sellerId: null, productId: null });
  });
  it('an as-is download from a real seller is delivered the moment it is paid, with a review time of its own', async () => {
    const o = await make();
    const now = (await getOrder(o.id))!;
    expect(now.state).toBe('delivered');
    expect(now.reviewEndsAt! - now.deliveredAt!).toBe(48 * 3_600_000);
  });
  it('anything else from a real seller waits for the seller: a package, or a site that must be put live', async () => {
    const custom = await make({ instant: false });
    expect((await getOrder(custom.id))!.state).toBe('funded');
    const site = await make({ instant: false, deliveryType: 'live_site' });
    expect((await tick((await getOrder(site.id))!, Date.now() + 60_000)).state).toBe('funded'); // no pretend seller builds it
  });
  it('the demo seller still builds a starter order', () => {
    const starter = {
      id: 'x',
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'live_site',
      state: 'funded',
      title: 't',
      buyerId: null,
      sellerId: null,
      productId: null,
      productKey: 'saffron-table',
      devKey: null,
      lines: [['t', 1000]],
      priceCents: 1000,
      feeCents: 150,
      refundedCents: 0,
      currency: 'USD',
      days: 1,
      express: false,
      instant: false,
      demo: true,
      attempts: 0,
      createdAt: 0,
      fundedAt: 1000,
      dueAt: 90_000_000,
    } as const;
    expect(dueSteps(starter as never, 1000 + 20_000).map((s) => s.event.event)).toContain('demo_seller_started');
  });
});
