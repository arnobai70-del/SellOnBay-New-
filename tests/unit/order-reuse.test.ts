import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/config';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { createOrder, getOrder } from '@/lib/orders/service';

let n = 0;
const buy = (buyerId: string | null, over: Partial<Parameters<typeof createOrder>[0]> = {}, now?: number) =>
  createOrder(
    {
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'live_site',
      title: 'Saffron Table',
      lines: [['Site', 5000]],
      days: 2,
      buyerId,
      sellerId: 'seller-reuse',
      productKey: 'saffron-table',
      domain: { name: 'saffron.example', source: 'own' },
      demo: false,
      ...over,
    },
    now,
  );

describe('pressing Buy twice', () => {
  it('a double click gives one order, even when both requests arrive together', async () => {
    const buyer = `reuse-b${++n}`;
    const [a, b] = await Promise.all([buy(buyer), buy(buyer)]);
    expect(b.id).toBe(a.id);
    expect((await buy(buyer)).id).toBe(a.id);
  });

  it('a different choice, price, seller or buyer is a new order', async () => {
    const buyer = `reuse-b${++n}`;
    const first = await buy(buyer);
    expect((await buy(buyer, { domain: { name: 'other.example', source: 'own' } })).id).not.toBe(first.id);
    expect((await buy(buyer, { lines: [['Site', 6000]] })).id).not.toBe(first.id);
    expect((await buy(buyer, { express: true })).id).not.toBe(first.id);
    expect((await buy(buyer, { sellerId: 'someone-else' })).id).not.toBe(first.id);
    expect((await buy(`reuse-b${++n}`)).id).not.toBe(first.id);
  });

  it('only an order still waiting for payment, and only within the time in lib/config.ts, is reused', async () => {
    const buyer = `reuse-b${++n}`;
    const t0 = Date.now();
    const first = await buy(buyer, {}, t0);
    const later = await buy(buyer, {}, t0 + CONFIG.orderReuseMinutes * 60_000 + 1);
    expect(later.id).not.toBe(first.id);

    await handlePaymentEvent('verified-test-psp', { id: 'evt_' + later.id, type: 'payment.succeeded', orderId: later.id, amountCents: later.priceCents, ref: 'p', at: Date.now() });
    expect((await getOrder(later.id))?.state).not.toBe('awaiting_payment');
    expect((await buy(buyer)).id).not.toBe(later.id); // paid already: buying again is a second purchase
  });

  it('signed-out demo orders are never matched', async () => {
    const a = await buy(null, { sellerId: null, demo: true });
    const b = await buy(null, { sellerId: null, demo: true });
    expect(b.id).not.toBe(a.id);
  });
});
