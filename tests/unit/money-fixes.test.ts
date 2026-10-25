import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { decide, openDispute } from '@/lib/disputes';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, chargeSellerFee, createOrder, deliver, ensureLedger, getOrder, runDueJobs } from '@/lib/orders/service';
import { planPayouts, registerSellerPayout } from '@/lib/payouts';
import { releaseDueReserves, setSellerReserve } from '@/lib/reserve';

/* Money paths found wrong in a review: a second dispute on one order, a seller with debt, and a released reserve. A $100 order earns the seller $78. */
const GOOD = 'On the second screen the Send button does nothing, the console shows a 500 error.';
let n = 0;
const seller = () => `mf-seller-${Date.now()}-${++n}`;
const accepted = async (sellerId: string) => {
  const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `mf-b${++n}`, sellerId, demo: false });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  await deliver(o.id, sellerId);
  await accept(o.id, o.buyerId);
  return (await getOrder(o.id))!;
};
const dispute = async (orderId: string, buyerId: string | null) => {
  const d = await openDispute(orderId, buyerId, { reason: 'not_working', detail: GOOD });
  if (!d.ok) throw new Error(d.error);
  return d.value;
};

describe('a second dispute on an order that already had a partial refund', () => {
  it('a full refund gives back only what is left, and the seller loses exactly what they earned', async () => {
    const s = seller();
    const o = await accepted(s);
    const L = await ledgerStore();
    const cash0 = await L.balance('platform_cash');
    expect((await decide((await dispute(o.id, o.buyerId)).id, 'admin-1', { decision: 'refund_partial', refundCents: 2000 })).ok).toBe(true);
    const second = await decide((await dispute(o.id, o.buyerId)).id, 'admin-1', { decision: 'refund_full' });
    expect(second.ok).toBe(true);
    await ensureLedger((await getOrder(o.id))!);
    expect(cash0 - (await L.balance('platform_cash'))).toBe(10_000); // $100 back to the buyer in all, not $120
    expect(await L.balance(acct.pending(s))).toBe(0);
    expect(await L.balance(acct.debt(s))).toBe(0); // the seller does not end up owing money
  });
  it('a second partial refund is refused, and a release keeps the first refund on the order', async () => {
    const s = seller();
    const o = await accepted(s);
    expect((await decide((await dispute(o.id, o.buyerId)).id, 'admin-1', { decision: 'refund_partial', refundCents: 2000 })).ok).toBe(true);
    const d2 = await dispute(o.id, o.buyerId);
    expect((await decide(d2.id, 'admin-1', { decision: 'refund_partial', refundCents: 1000 })).ok).toBe(false);
    expect((await decide(d2.id, 'admin-1', { decision: 'release' })).ok).toBe(true);
    expect((await getOrder(o.id))!.refundedCents).toBe(2000);
  });
});

describe('the weekly payout pays what the ledger made available for each order', () => {
  it('a seller whose earnings paid off a debt is paid the rest, not skipped', async () => {
    const s = seller();
    registerSellerPayout(s, 'Debt Seller', 'wise', 'd@example.com');
    const first = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `mf-b${++n}`, sellerId: s, demo: false });
    await chargeSellerFee({ ...first, sellerId: s }, `test-fee:${first.id}`, 'Test fee', 1500); // nothing to take from yet: $15 of debt
    const L = await ledgerStore();
    expect(await L.balance(acct.debt(s))).toBe(1500);
    await accepted(s);
    await runDueJobs(Date.now() + 8 * DAY_MS);
    expect(await L.balance(acct.available(s))).toBe(6300);
    const plan = await planPayouts(Date.now() + 8 * DAY_MS);
    expect(plan.created.find((p) => p.sellerId === s)?.amountCents).toBe(6300);
    expect(plan.skipped.some((x) => x.sellerId === s)).toBe(false);
  });
  it('a reserve released before the first payout is paid once, with the rest of the order', async () => {
    const s = seller();
    expect((await setSellerReserve('admin-1', s, 20, 1, 'Newer seller, to be safe.')).ok).toBe(true);
    await accepted(s);
    await runDueJobs(Date.now() + 8 * DAY_MS);
    const first = await planPayouts(Date.now() + 8 * DAY_MS);
    expect(first.skipped.find((x) => x.sellerId === s)?.reason).toBe('no payout method on file');
    expect(await releaseDueReserves(Date.now() + 20 * DAY_MS)).toBeGreaterThanOrEqual(1);
    registerSellerPayout(s, 'Reserve Seller', 'wise', 'r2@example.com');
    const L = await ledgerStore();
    expect(await L.balance(acct.available(s))).toBe(7800);
    const plan = await planPayouts(Date.now() + 21 * DAY_MS);
    expect(plan.created.find((p) => p.sellerId === s)?.amountCents).toBe(7800);
  });
});
