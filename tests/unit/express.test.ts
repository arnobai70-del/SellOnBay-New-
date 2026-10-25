import { describe, expect, it } from 'vitest';
import { CONFIG, HOUR_MS } from '@/lib/config';
import { quoteSite } from '@/lib/commerce/quote';
import { expressOf } from '@/lib/handover';
import { findAny } from '@/lib/apps';
import { split, acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { EXPRESS_LABEL, baseCents, orderFee } from '@/lib/orders/machine';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder } from '@/lib/orders/service';

const site = { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' };

describe('24-hour express delivery', () => {
  it('starter express prices are inside the limits in config', () => {
    for (const id of ['saffron-table', 'clinic-desk', 'folio-studio', 'shopline', 'seo-audit', 'wp-booking', 'taskboard']) {
      const x = expressOf(findAny(id)!)!;
      expect(x * 100, id).toBeGreaterThanOrEqual(CONFIG.delivery.expressMinCents);
      expect(x * 100, id).toBeLessThanOrEqual(CONFIG.delivery.expressMaxCents);
    }
    expect(expressOf(findAny('fittrack')!)).toBeUndefined();
  });
  it('the quote adds the express line only when asked, from the seller price list, never from the browser', async () => {
    const plain = await quoteSite(site);
    const fast = await quoteSite({ ...site, express: true, expressPrice: 1 } as typeof site & { express: boolean });
    if ('error' in plain || 'error' in fast) throw new Error('quote');
    expect(fast.totalCents - plain.totalCents).toBe(1500);
    expect(fast.lines.find((l) => l[0] === EXPRESS_LABEL)?.[1]).toBe(1500);
    expect(fast.express).toBe(true);
    expect(plain.express).toBe(false);
  });
  it('refused when the seller does not offer it, and for an as-is download that is delivered at once', async () => {
    expect(await quoteSite({ productId: 'fittrack', pkg: 'asis', appName: 'My app', express: true })).toMatchObject({ error: expect.stringMatching(/does not offer/) });
    expect(await quoteSite({ productId: 'n8n-leads', pkg: 'asis', express: true })).toMatchObject({ error: expect.stringMatching(/express/) });
  });
  it('the express price is the seller price: the fee is taken on it, the rest goes to the seller', () => {
    const lines: [string, number][] = [
      ['Site', 10_000],
      [EXPRESS_LABEL, 1_500],
      ['Domain', 1_200],
    ];
    expect(baseCents(lines)).toBe(11_500);
    const fee = orderFee(lines, 'product');
    expect(fee).toBe(2_530); // 22% of 115.00
    const s = split(lines, fee);
    expect(s.sellerNet).toBe(8_970);
    expect(s.sellerNet + s.platform).toBe(s.total);
    expect(
      baseCents([
        ['Site', 10_000],
        ['Other', 500],
      ]),
    ).toBe(10_000); // a line with another label is not seller money
  });
  it('an express order is due in 24 hours, not in the listed days, and the money adds up through accept', async () => {
    const lines: [string, number][] = [
      ['Site', 10_000],
      [EXPRESS_LABEL, 1_500],
    ];
    const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines, days: 3, buyerId: 'ex-b', sellerId: 'ex-s', express: true, demo: false });
    await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
    const f = (await getOrder(o.id))!;
    expect(f.dueAt! - f.fundedAt!).toBe(CONFIG.delivery.expressHours * HOUR_MS);
    await deliver(o.id, 'ex-s');
    await accept(o.id, 'ex-b');
    const L = await ledgerStore();
    expect(await L.balance(acct.escrow(o.id))).toBe(0);
    expect(await L.balance(acct.pending('ex-s'))).toBe(11_500 - 2_530);
  });
});
