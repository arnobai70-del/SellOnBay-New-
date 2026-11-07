import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS } from '@/lib/config';
import { adminSubscriptionAction, checkListingLimit, requestPlan, sellerPlan } from '@/lib/plans/service';
import { setMemListings, subscriptionEvents } from '@/lib/plans/store';

const seller = () => `seller-${Math.random().toString(36).slice(2, 10)}`;

describe('seller plan lifecycle (O-4: admin decides each step)', () => {
  it('a seller starts on Free and may ask for Pro or Business only', async () => {
    const s = seller();
    expect((await sellerPlan(s)).plan.code).toBe('free');
    expect(await requestPlan(s, 'free', 'monthly')).toMatchObject({ ok: false });
    expect(await requestPlan(s, 'gold', 'monthly')).toMatchObject({ ok: false });
    expect(await requestPlan(s, 'pro', 'weekly')).toMatchObject({ ok: false });
    const r = await requestPlan(s, 'pro', 'yearly');
    expect(r.ok && r.value).toMatchObject({ status: 'requested', priceCents: 19380, billing: 'yearly' });
    expect(await requestPlan(s, 'business', 'monthly')).toMatchObject({ ok: false, status: 409 }); // one open at a time
    expect((await sellerPlan(s)).plan.code).toBe('free'); // a request gives no benefits
  });

  it('activation needs a reconciled payment reference and a period; benefits start then; every step is logged and audited', async () => {
    const s = seller();
    const r = await requestPlan(s, 'business', 'monthly');
    if (!r.ok) throw new Error('request');
    const id = r.value.id;
    expect(await adminSubscriptionAction('admin-1', id, 'activate', { reason: 'Paid by bank.' })).toMatchObject({ ok: false, status: 400 });
    expect(await adminSubscriptionAction('admin-1', id, 'activate', { reason: 'Paid by bank.', paymentRef: 'BANK-123', periodDays: 0 })).toMatchObject({ ok: false });
    expect(await adminSubscriptionAction('admin-1', id, 'activate', { reason: 'no' })).toMatchObject({ ok: false, status: 400 });
    const now = Date.UTC(2026, 10, 1);
    const a = await adminSubscriptionAction('admin-1', id, 'activate', { reason: 'Paid by bank transfer.', paymentRef: 'BANK-123', periodDays: 30 }, now);
    expect(a.ok && a.value).toMatchObject({ status: 'active', periodStart: now, periodEnd: now + 30 * DAY_MS });
    expect((await sellerPlan(s)).plan).toMatchObject({ code: 'business', commissionBps: 500, listingLimit: 100 });
    const events = await subscriptionEvents(id);
    expect(events.map((e) => e.event)).toEqual(['requested', 'activate']);
    expect(events[1].meta).toMatchObject({ paymentRef: 'BANK-123', periodDays: 30 });
    const audit = (await auditList(100)).find((e) => e.action === 'subscription_activate' && e.targetRef === id);
    expect(audit?.detail).toMatchObject({ reason: 'Paid by bank transfer.', from: 'requested', to: 'active' });
  });

  it('a failed renewal keeps benefits until an admin ends it; an ended subscription returns the seller to Free', async () => {
    const s = seller();
    const r = await requestPlan(s, 'pro', 'monthly');
    if (!r.ok) throw new Error('request');
    const id = r.value.id;
    await adminSubscriptionAction('admin-1', id, 'activate', { reason: 'Paid by wallet.', paymentRef: 'W-1', periodDays: 30 });
    expect((await adminSubscriptionAction('admin-1', id, 'renewal_due', { reason: 'Period ends soon.' })).ok).toBe(true);
    expect((await adminSubscriptionAction('admin-1', id, 'renewal_failed', { reason: 'No payment arrived.' })).ok).toBe(true);
    expect((await sellerPlan(s)).plan.code).toBe('pro');
    expect(await adminSubscriptionAction('admin-1', id, 'cancel', { reason: 'Not allowed from failed.' })).toMatchObject({ ok: false, status: 409 });
    expect((await adminSubscriptionAction('admin-1', id, 'end', { reason: 'Seller did not renew.' })).ok).toBe(true);
    expect((await sellerPlan(s)).plan.code).toBe('free');
    expect(await adminSubscriptionAction('admin-1', id, 'resume', { reason: 'Too late, it ended.' })).toMatchObject({ ok: false, status: 409 });
  });

  it('a renewal extends from the end of the current period, not from today', async () => {
    const s = seller();
    const r = await requestPlan(s, 'pro', 'monthly');
    if (!r.ok) throw new Error('request');
    const t0 = Date.UTC(2026, 10, 1);
    await adminSubscriptionAction('admin-1', r.value.id, 'activate', { reason: 'First month paid.', paymentRef: 'B-1', periodDays: 30 }, t0);
    await adminSubscriptionAction('admin-1', r.value.id, 'renewal_due', { reason: 'Reminder sent.' }, t0 + 25 * DAY_MS);
    const n = await adminSubscriptionAction('admin-1', r.value.id, 'renew', { reason: 'Second month paid.', paymentRef: 'B-2', periodDays: 30 }, t0 + 26 * DAY_MS);
    expect(n.ok && n.value.periodEnd).toBe(t0 + 60 * DAY_MS);
  });
});

describe('listing limit by plan (O-3)', () => {
  it('every seller on the flat plan can have 100 published or waiting listings', async () => {
    const s = seller();
    setMemListings(s, 99);
    expect(await checkListingLimit(s)).toEqual({ ok: true });
    setMemListings(s, 100);
    expect((await checkListingLimit(s)).ok).toBe(false);
    const r = await requestPlan(s, 'business', 'yearly');
    if (!r.ok) throw new Error('request');
    await adminSubscriptionAction('admin-1', r.value.id, 'activate', { reason: 'Paid yearly.', paymentRef: 'Y-1', periodDays: 365 });
    setMemListings(s, 99);
    expect(await checkListingLimit(s)).toEqual({ ok: true });
    setMemListings(s, 100);
    expect((await checkListingLimit(s)).ok).toBe(false);
  });
});
