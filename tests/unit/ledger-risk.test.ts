import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { CONFIG, DAY_MS } from '@/lib/config';
import { decide, getDispute, openDispute } from '@/lib/disputes';
import { Ledger, LedgerError, acct, buyerPays, holdMoved, partialRefundAfterAccept, reserveReleased, reserveShare, sellerFee, takeFromSeller, type EntrySet } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, chargeSellerFee, createOrder, deliver, ensureLedger, getOrder, runDueJobs } from '@/lib/orders/service';
import { planPayouts, registerSellerPayout } from '@/lib/payouts';
import { releaseDueReserves, removeSellerReserve, reserveRule, setSellerReserve } from '@/lib/reserve';

const money = { id: 'o1', sellerId: 's1', lines: [['Site', 10_000]] as [string, number][], feeCents: 1_500 };
const GOOD = 'On the second screen the Send button does nothing, the console shows a 500 error.';

describe('taking money back from a seller', () => {
  it('comes out of pending, then reserve, then available, then becomes debt, and never more than they hold', () => {
    expect(takeFromSeller('s1', 4500, { pending: 3000, reserve: 2000, available: 1000 })).toEqual([
      { account: 'seller_pending:s1', amountCents: 3000, side: 'debit' },
      { account: 'seller_reserve:s1', amountCents: 1500, side: 'debit' },
    ]);
    expect(takeFromSeller('s1', 7000, { pending: 3000, reserve: 2000, available: 1000 }).map((l) => [l.account, l.amountCents])).toEqual([
      ['seller_pending:s1', 3000],
      ['seller_reserve:s1', 2000],
      ['seller_available:s1', 1000],
      ['seller_debt:s1', 1000],
    ]);
    expect(takeFromSeller('s1', 0, { pending: 5, reserve: 5, available: 5 })).toEqual([]);
    expect(takeFromSeller('s1', 800, { pending: 0, reserve: 0, available: 0 })).toEqual([{ account: 'seller_debt:s1', amountCents: 800, side: 'debit' }]);
    expect(() => takeFromSeller('s1', 1.5, { pending: 0, reserve: 0, available: 0 })).toThrow(LedgerError);
  });
  it('a refund after the money has gone becomes debt instead of failing, and the ledger still balances', () => {
    const L = new Ledger();
    L.post(buyerPays(money));
    const e = partialRefundAfterAccept(money, 2000, { pending: 0, reserve: 0, available: 0 });
    expect(e.lines.some((l) => l.account === 'seller_debt:s1' && l.amountCents === 2000)).toBe(true);
    expect(L.post(e)).toBe(true);
    expect(L.balance('seller_debt:s1')).toBe(2000); // what the seller owes is positive
    expect(L.isBalanced()).toBe(true);
    expect(() => new Ledger().post(partialRefundAfterAccept(money, 2000))).toThrow(LedgerError); // the old rule without balances: pending cannot go below zero
  });
  it('a fee the seller is at fault for is paid to the platform cash from the seller', () => {
    const e: EntrySet = sellerFee({ id: 'o1', sellerId: 's1' }, 'dispute-fee:d1', 'fee', 1500, { pending: 1000, reserve: 0, available: 1000 });
    expect(e.lines.map((l) => [l.account, l.amountCents, l.side])).toEqual([
      ['seller_pending:s1', 1000, 'debit'],
      ['seller_available:s1', 500, 'debit'],
      ['platform_cash', 1500, 'credit'],
    ]);
  });
});

describe('reserve arithmetic', () => {
  it('a share is rounded down in whole cents and never more than the amount', () => {
    expect(reserveShare(8500, 20)).toBe(1700);
    expect(reserveShare(999, 10)).toBe(99);
    expect(reserveShare(100, 150)).toBe(100);
    expect(reserveShare(100, -5)).toBe(0);
  });
  it('the hold moves only what is really pending, keeps the reserve back, and does nothing when nothing is left', () => {
    expect(holdMoved(money, 0, { pendingCents: 5000, reserveCents: 1000 })!.lines.map((l) => [l.account, l.amountCents])).toEqual([
      ['seller_pending:s1', 5000],
      ['seller_available:s1', 4000],
      ['seller_reserve:s1', 1000],
    ]);
    expect(holdMoved(money, 0, { pendingCents: 0 })).toBeNull();
    expect(holdMoved(money)!.lines.find((l) => l.account === 'seller_available:s1')!.amountCents).toBe(8500);
  });
  it('a reserve account cannot go below zero', () => {
    const L = new Ledger();
    L.post(buyerPays(money));
    expect(() => L.post(reserveReleased({ id: 'o1', sellerId: 's1' }, 100))).toThrow(LedgerError);
  });
});

let n = 0;
const seller = () => `lr-seller-${Date.now()}-${++n}`;
/* A $100 order (the seller earns $85) funded, delivered and accepted. */
const accepted = async (sellerId: string) => {
  const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `lr-b${++n}`, sellerId, demo: false });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  await deliver(o.id, sellerId);
  await accept(o.id, o.buyerId);
  return o;
};
const hold = async () => runDueJobs(Date.now() + 8 * DAY_MS);

describe('the seller reserve', () => {
  it('is off by default, and a rule for one seller keeps part back and lets it go later, outside the weekly payout', async () => {
    expect(CONFIG.reserve).toEqual({ percent: 0, days: 0 });
    const plain = seller();
    expect(await reserveRule(plain)).toEqual({ percent: 0, days: 0, custom: false });
    const s = seller();
    expect((await setSellerReserve('admin-1', s, 20, 3, 'no')).ok).toBe(false); // a reason is needed
    expect((await setSellerReserve('admin-1', s, 101, 3, 'Newer seller, to be safe.')).ok).toBe(false);
    expect((await setSellerReserve('admin-1', s, 20, 3, 'Newer seller, to be safe.')).ok).toBe(true);
    expect(await reserveRule(s)).toEqual({ percent: 20, days: 3, custom: true });
    registerSellerPayout(s, 'Reserve Seller', 'wise', 'r@example.com');
    await accepted(s);
    await hold();
    const L = await ledgerStore();
    expect(await L.balance(acct.available(s))).toBe(6240);
    expect(await L.balance(acct.reserve(s))).toBe(1560);
    const plan = await planPayouts(Date.now() + 8 * DAY_MS);
    expect(plan.created.find((p) => p.sellerId === s)?.amountCents).toBe(6240); // the reserve is not paid out
    expect(await releaseDueReserves(Date.now() + 8 * DAY_MS)).toBe(0); // not yet
    expect(await releaseDueReserves(Date.now() + 12 * DAY_MS)).toBeGreaterThanOrEqual(1);
    expect(await L.balance(acct.reserve(s))).toBe(0);
    expect(await L.balance(acct.available(s))).toBe(7800);
    expect(await releaseDueReserves(Date.now() + 13 * DAY_MS)).toBe(0); // once
    expect((await auditList(300)).some((e) => e.action === 'seller_reserve_set' && e.targetRef === s)).toBe(true);
    expect((await removeSellerReserve('admin-1', s, 'Settled in.')).ok).toBe(true);
    expect((await reserveRule(s)).custom).toBe(false);
  });
});

describe('debt and the dispute record', () => {
  it('a fee the seller cannot cover becomes debt and is taken from the next earnings', async () => {
    const s = seller();
    const first = await accepted(s);
    expect(await chargeSellerFee({ ...first, sellerId: s }, `test-fee:${first.id}`, 'Test fee', 1500)).toBe(1500);
    const L = await ledgerStore();
    expect(await L.balance(acct.debt(s))).toBe(0); // the first order's pending money covered it
    expect(await L.balance(acct.pending(s))).toBe(6300);
    const empty = seller();
    const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `lr-b${++n}`, sellerId: empty, demo: false });
    await chargeSellerFee({ ...o, sellerId: empty }, `test-fee2:${o.id}`, 'Test fee', 1500);
    expect(await L.balance(acct.debt(empty))).toBe(1500);
    const next = await accepted(empty);
    await ensureLedger((await getOrder(next.id))!);
    expect(await L.balance(acct.debt(empty))).toBe(0);
    expect(await L.balance(acct.pending(empty))).toBe(6300); // 7800 minus the 1500 owed
  });
  it('a decided dispute records who was at fault and the fee; only a seller at fault pays it, and a fee needs a stated fault', async () => {
    const s = seller();
    const make = async () => {
      const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `lr-b${++n}`, sellerId: s, demo: false });
      await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
      await deliver(o.id, s);
      const d = await openDispute(o.id, o.buyerId, { reason: 'not_working', detail: GOOD });
      if (!d.ok) throw new Error(d.error);
      return { o, d: d.value };
    };
    const a = await make();
    expect((await decide(a.d.id, 'admin-1', { decision: 'release', feeCents: 1500 })).ok).toBe(false); // no stated fault
    expect((await decide(a.d.id, 'admin-1', { decision: 'release', liability: 'seller', feeCents: 200_000 })).ok).toBe(false);
    const L = await ledgerStore();
    const before = await L.balance(acct.debt(s));
    const done = await decide(a.d.id, 'admin-1', { decision: 'release', liability: 'seller', feeCents: 1500, note: 'Seller shipped a broken form.' });
    expect(done.ok).toBe(true);
    const rec = (await getDispute(a.d.id))!;
    expect(rec).toMatchObject({ status: 'decided', decision: 'release', liability: 'seller', feeCents: 1500, feeChargedCents: 1500, reason: 'not_working' });
    // The order was released to the seller (7800 pending) and the fee came out of it: no debt was needed.
    expect(await L.balance(acct.pending(s))).toBe(6300);
    expect((await L.balance(acct.debt(s))) - before).toBe(0);

    const b = await make();
    const other = await decide(b.d.id, 'admin-1', { decision: 'release', liability: 'platform', feeCents: 1500 });
    expect(other.ok).toBe(true);
    expect((await getDispute(b.d.id))!).toMatchObject({ liability: 'platform', feeCents: 1500 });
    expect((await getDispute(b.d.id))!.feeChargedCents).toBeUndefined(); // nobody pays it
  });
});
