import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { decide, openDispute } from '@/lib/disputes';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { createExtra } from '@/lib/orders/extra';
import { accept, chargeSellerFee, createOrder, deliver, getOrder, move, runDueJobs } from '@/lib/orders/service';
import { findTrialCredit } from '@/lib/orders/trial';

/* Money paths found wrong in a review: debt paid from earnings, a provider refund with extra work, a trial refunded after its credit was used. */
const DETAIL = 'On the second screen the Send button does nothing, the console shows a 500 error.';
let n = 0;
const paid = async (sellerId: string, buyerId = `me-b${++n}`, lines: [string, number][] = [['Site', 10_000]], kind: 'product' | 'trial' | 'custom' = 'product', extra: object = {}) => {
  const o = await createOrder({ kind, pkg: kind === 'product' ? 'asis' : 'custom', deliveryType: 'live_site', title: 'X', lines, days: 3, buyerId, sellerId, demo: false, ...extra });
  await handlePaymentEvent('verified-test-psp', { id: 'evt_' + o.id, type: 'payment.succeeded', orderId: o.id, amountCents: o.priceCents, ref: 'p' + o.id, at: Date.now() });
  return o;
};

describe('money edge cases', () => {
  it("earnings that paid off a debt are not taken again from another order's hold", async () => {
    const t0 = Date.now();
    const s = `me-s${++n}`;
    const first = await createOrder({ kind: 'product', pkg: 'asis', deliveryType: 'live_site', title: 'X', lines: [['Site', 10_000]], days: 3, buyerId: 'q', sellerId: s, demo: false });
    await chargeSellerFee(first, `fee:${first.id}`, 'Dispute fee', 1_500); // nothing held yet: $15 of debt
    const a = await paid(s);
    await deliver(a.id, s);
    await accept(a.id, a.buyerId); // $78 earned, $15 of it pays the debt
    const b = await paid(s);
    await deliver(b.id, s);
    await move(b.id, 'accepted', { actorId: null, event: 'accepted', now: t0 + 3 * DAY_MS }); // its hold ends 3 days later
    await runDueJobs(t0 + 7.5 * DAY_MS);
    const L = await ledgerStore();
    expect((await getOrder(b.id))!.state).toBe('accepted');
    expect(await L.balance(acct.available(s))).toBe(6_300);
    expect(await L.balance(acct.pending(s))).toBe(7_800); // b's earnings stay in its hold
    expect(await L.balance(acct.debt(s))).toBe(0);
  });

  it('a provider refund of the price only, with funded extra work, goes to an admin instead of cancelling', async () => {
    const s = `me-s${++n}`;
    const o = await paid(s);
    const c = await createExtra(o.id, s, { title: 'Gallery page', priceCents: 2_500, addDays: 1 });
    if (!c.ok) throw new Error(c.error);
    await handlePaymentEvent('verified-test-psp', {
      id: 'x_' + c.request.id,
      type: 'payment.succeeded',
      orderId: o.id,
      amountCents: 2_500,
      ref: 'px' + o.id,
      at: Date.now(),
      changeRequestId: c.request.id,
    });
    const part = await handlePaymentEvent('verified-test-psp', { id: 'rf_' + o.id, type: 'refund.succeeded', orderId: o.id, amountCents: 10_000, ref: 'rf' + o.id, at: Date.now() });
    expect(part.status).toBe('ignored');
    expect((await getOrder(o.id))!.state).toBe('funded');
    const all = await handlePaymentEvent('verified-test-psp', { id: 'rf2_' + o.id, type: 'refund.succeeded', orderId: o.id, amountCents: 12_500, ref: 'rf2' + o.id, at: Date.now() });
    expect(all.status).toBe('applied');
    expect((await getOrder(o.id))!.state).toBe('cancelled');
    expect(await (await ledgerStore()).balance(acct.escrow(o.id))).toBe(0);
  });

  it('a trial whose fee was credited to a full order cannot also be refunded', async () => {
    const s = `me-s${++n}`;
    const buyer = `me-b${++n}`;
    const t = await paid(s, buyer, [['Trial package', 3_500]], 'trial', { devKey: `dev-${n}` });
    await deliver(t.id, s);
    await accept(t.id, buyer);
    const credit = await findTrialCredit(buyer, `dev-${n}`, 20_000);
    expect(credit?.creditCents).toBe(3_500);
    await paid(s, buyer, [['Basic package, trial credit applied', 20_000 - credit!.creditCents]], 'custom', { devKey: `dev-${n}`, trialCreditFor: credit!.trialId });
    const d = await openDispute(t.id, buyer, { reason: 'not_working', detail: DETAIL });
    if (!d.ok) throw new Error(d.error);
    expect(await decide(d.value.id, 'admin', { decision: 'refund_full' })).toMatchObject({ ok: false, status: 409 });
    expect(await decide(d.value.id, 'admin', { decision: 'refund_partial', refundCents: 1_000 })).toMatchObject({ ok: false, status: 409 });
    expect((await decide(d.value.id, 'admin', { decision: 'fix_requested' })).ok).toBe(true);
  });
});
