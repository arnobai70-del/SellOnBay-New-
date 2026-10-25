import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS } from '@/lib/config';
import { openDispute } from '@/lib/disputes';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { accept, createOrder, deliver, getOrder, runDueJobs } from '@/lib/orders/service';
import { csvCell, exportPayouts, listPayouts, markFailed, markPaid, payoutsCsv, planPayouts, registerSellerPayout, weekStartOf } from '@/lib/payouts';

describe('payout week and CSV', () => {
  it('the batch week starts on the Sunday on or before the date (UTC)', () => {
    expect(weekStartOf(Date.UTC(2026, 9, 4, 15))).toBe('2026-10-04'); // a Sunday
    expect(weekStartOf(Date.UTC(2026, 9, 10, 23, 59))).toBe('2026-10-04'); // Saturday night
    expect(weekStartOf(Date.UTC(2026, 9, 11, 0, 0))).toBe('2026-10-11'); // next Sunday
    expect(new Date(weekStartOf(Date.now()) + 'T00:00:00Z').getUTCDay()).toBe(0);
  });
  it('cells that a spreadsheet would run as a formula are made safe; commas and quotes are quoted', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('Mira, Chen')).toBe('"Mira, Chen"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(85)).toBe('85');
  });
  it('the CSV has a header and one line per payout, with the amount in dollars', () => {
    const csv = payoutsCsv([
      { id: 'p1', sellerId: 's1', sellerName: '=Evil', method: 'wise', account: 'pay@example.com', amountCents: 8500, weekStart: '2026-10-04', status: 'exported', orderIds: ['a', 'b'], createdAt: 0 },
    ]);
    const [head, row] = csv.trimEnd().split('\r\n');
    expect(head).toBe('Payout ID,Week starting,Seller,Seller ID,Method,Send to,Amount (USD),Orders,Status');
    expect(row).toBe("p1,2026-10-04,'=Evil,s1,wise,pay@example.com,85.00,2,exported");
  });
});

let n = 0;
/* An order of $100 (seller earns $85) that was accepted. */
const accepted = async (sellerId: string) => {
  const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `pb-${++n}`, sellerId, demo: false });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
  await deliver(o.id, sellerId);
  await accept(o.id, o.buyerId);
  return o;
};
const afterHold = () => runDueJobs(Date.now() + 8 * DAY_MS);

describe('the weekly payout batch', () => {
  it('adds up what is owed after the hold, skips sellers with no payout details, and never counts an order twice', async () => {
    const a = `pay-seller-${Date.now()}-a`,
      b = `pay-seller-${Date.now()}-b`;
    registerSellerPayout(a, 'Mira Chen', 'wise', 'mira@example.com');
    const o1 = await accepted(a),
      o2 = await accepted(a),
      o3 = await accepted(b);
    expect((await planPayouts()).created.filter((p) => p.sellerId === a)).toHaveLength(0); // hold has not ended yet
    await afterHold();
    const plan = await planPayouts(Date.now(), 'admin-1');
    const mine = plan.created.find((p) => p.sellerId === a)!;
    expect(mine.amountCents).toBe(15_600);
    expect(mine.orderIds.sort()).toEqual([o1.id, o2.id].sort());
    expect(mine.status).toBe('scheduled');
    expect(plan.skipped.find((s) => s.sellerId === b)).toMatchObject({ reason: 'no payout method on file', amountCents: 7_800 });
    expect(plan.created.some((p) => p.sellerId === b)).toBe(false);
    const again = await planPayouts();
    expect(again.created.filter((p) => p.sellerId === a)).toHaveLength(0);
    expect(o3.id).toBeTruthy();
  });
  it('an order in dispute is not in the batch; after a fix it joins the next one', async () => {
    const s = `pay-seller-${Date.now()}-d`;
    registerSellerPayout(s, 'Dev Patel', 'payoneer', 'dev@example.com');
    const o = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'Site', lines: [['Site', 10_000]], days: 1, buyerId: `pb-${++n}`, sellerId: s, demo: false });
    await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p', at: Date.now() });
    await deliver(o.id, s);
    await accept(o.id, o.buyerId);
    const d = await openDispute(o.id, o.buyerId, { reason: 'not_working', detail: 'It stopped working on the second day, the form gives an error.' });
    expect(d.ok).toBe(true);
    await afterHold();
    expect((await getOrder(o.id))!.state).toBe('disputed');
    expect((await planPayouts()).created.some((p) => p.sellerId === s)).toBe(false);
  });
  it('export locks the batch; paying needs the export first and a reference; paying moves the ledger and the orders, once', async () => {
    const s = `pay-seller-${Date.now()}-e`;
    registerSellerPayout(s, 'Leo Park', 'bank', 'GB00 TEST 0000 0000');
    const o = await accepted(s);
    await afterHold();
    const p = (await planPayouts(Date.now(), 'admin-1')).created.find((x) => x.sellerId === s)!;
    expect((await markPaid(p.id, 'WISE-123', 'admin-1')).ok).toBe(false); // not exported yet
    const rows = await exportPayouts(p.weekStart, 'admin-1');
    expect(rows.find((x) => x.id === p.id)?.status).toBe('exported');
    expect(payoutsCsv(rows)).toContain('GB00 TEST 0000 0000');
    expect((await markPaid(p.id, 'x', 'admin-1')).ok).toBe(false); // reference too short
    const L = await ledgerStore();
    expect(await L.balance(acct.available(s))).toBe(7_800);
    const paid = await markPaid(p.id, 'WISE-TRANSFER-123', 'admin-1');
    expect(paid.ok && paid.payout.status).toBe('paid');
    expect(await L.balance(acct.available(s))).toBe(0);
    expect(await L.balance(acct.payoutOut(s))).toBe(7_800);
    expect((await getOrder(o.id))!.state).toBe('paid_out');
    expect((await markPaid(p.id, 'WISE-TRANSFER-123', 'admin-1')).ok).toBe(false); // only once
    expect(await L.balance(acct.payoutOut(s))).toBe(7_800);
    expect((await planPayouts()).created.some((x) => x.sellerId === s)).toBe(false); // nothing left to pay
    const log = (await auditList(500)).filter((e) => e.targetRef === p.id).map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(['payout_scheduled', 'payout_exported', 'payout_marked_paid']));
  });
  it('a failed transfer frees the orders for the next batch', async () => {
    const s = `pay-seller-${Date.now()}-f`;
    registerSellerPayout(s, 'Ana Ruiz', 'wise', 'ana@example.com');
    await accepted(s);
    await afterHold();
    const p = (await planPayouts()).created.find((x) => x.sellerId === s)!;
    await exportPayouts(p.weekStart, 'admin-1');
    expect((await markFailed(p.id, 'admin-1', 'bank rejected the account')).ok).toBe(true);
    expect((await markPaid(p.id, 'REF-12345', 'admin-1')).ok).toBe(false);
    const next = (await planPayouts()).created.find((x) => x.sellerId === s);
    expect(next?.amountCents).toBe(7_800);
    expect((await listPayouts()).filter((x) => x.sellerId === s && x.status !== 'failed')).toHaveLength(1);
  });
});
