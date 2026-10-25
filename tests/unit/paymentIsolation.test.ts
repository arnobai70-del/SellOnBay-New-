import { describe, expect, it } from 'vitest';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { createOrder, getOrder } from '@/lib/orders/service';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';

let sequence = 0;
const make = (values: Partial<Parameters<typeof createOrder>[0]> = {}) =>
  createOrder({
    kind: 'product',
    pkg: 'asis',
    deliveryType: 'download',
    title: 'A test listing',
    lines: [['Listing', 2500]],
    days: 2,
    buyerId: null,
    sellerId: null,
    productKey: 'example',
    demo: true,
    ...values,
  });
const pay = (order: { id: string; priceCents: number }, props: Record<string, unknown> = {}) =>
  handlePaymentEvent('fake', {
    id: 'evt_isolation_' + ++sequence,
    type: 'payment.succeeded',
    orderId: order.id,
    amountCents: order.priceCents,
    ref: 'fake_isolation_' + sequence,
    at: Date.now(),
    ...props,
  });

describe('server fake gateway financial isolation', () => {
  it('funds a built-in example only with a simulated card event', async () => {
    const o = await make();
    expect((await pay(o)).status).toBe('applied');
    expect((await getOrder(o.id))?.fundedAt).toBeTruthy();
  });

  it('never credits seller ledger or unlocks a real seller purchase', async () => {
    const o = await make({ sellerId: 'real-seller', demo: false });
    const result = await pay(o);
    expect(result).toEqual({ status: 'rejected', reason: 'test gateway cannot modify a real order' });
    expect((await getOrder(o.id))?.state).toBe('awaiting_payment');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(0);
  });

  it('never funds custom or trial developer work from a fake webhook', async () => {
    for (const kind of ['custom', 'trial'] as const) {
      const o = await make({ kind, devKey: 'real-dev', demo: false });
      expect((await pay(o)).status).toBe('rejected');
      expect((await getOrder(o.id))?.state).toBe('awaiting_payment');
    }
  });

  it('rejects fake extra-payment events on a real seller order before funding anything', async () => {
    const o = await make({ sellerId: 'seller-b', demo: false });
    const out = await pay(o, { changeRequestId: 'not-a-real-extra' });
    expect(out.status).toBe('rejected');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(0);
  });
});
