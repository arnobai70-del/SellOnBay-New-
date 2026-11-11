import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/* Admin › Subscription Management › Seller (owner, 2026-11-12): the existing seller plan system, with a switch and versioned edits. Memory mode. */
describe('seller subscriptions in Subscription Management', () => {
  it('checks a seller plan form', async () => {
    const { checkSellerPlan } = await import('@/lib/plans/admin');
    expect(checkSellerPlan({ code: 'pro', name: 'Pro', monthlyCents: 1900, yearlyCents: 19380, commissionBps: 1000, listingLimit: 25 }).ok).toBe(true);
    expect(checkSellerPlan({ code: 'gold', name: 'X', monthlyCents: 1, yearlyCents: 1, commissionBps: 1, listingLimit: 1 }).ok).toBe(false);
    expect(checkSellerPlan({ code: 'pro', name: 'Pro', monthlyCents: 1, yearlyCents: 1, commissionBps: 10001, listingLimit: 1 }).ok).toBe(false);
    expect(checkSellerPlan({ code: 'pro', name: '', monthlyCents: 1, yearlyCents: 1, commissionBps: 1, listingLimit: 1 }).ok).toBe(false);
  });

  it('is off by default: a seller cannot ask for a plan; on and offered, they can', async () => {
    const admin = await import('@/lib/plans/admin');
    const { requestPlan } = await import('@/lib/plans/service');
    expect((await admin.sellerSubSettings()).enabled).toBe(false);
    expect((await requestPlan('seller-1', 'pro', 'monthly')).ok).toBe(false);
    const s = await admin.sellerSubSettings();
    await admin.saveSellerSubSettings('admin-1', { enabled: true, display: s.display as unknown as Record<string, unknown> });
    expect((await admin.setPlanOffered('admin-1', 'pro', true)).ok).toBe(true);
    const r = await requestPlan('seller-1', 'pro', 'monthly');
    expect(r.ok).toBe(true);
    // hidden from sellers: no new request even while on
    const hidden = { ...s.display, business: { ...s.display.business, visible: false } };
    await admin.saveSellerSubSettings('admin-1', { enabled: true, display: hidden as unknown as Record<string, unknown> });
    await admin.setPlanOffered('admin-1', 'business', true);
    expect((await requestPlan('seller-2', 'business', 'yearly')).ok).toBe(false);
  });

  it('an edit is the next version; Free cannot be withdrawn', async () => {
    const admin = await import('@/lib/plans/admin');
    const before = (await admin.planVersions()).filter((v) => v.code === 'pro');
    const saved = await admin.savePlanVersion('admin-1', { code: 'pro', name: 'Pro', monthlyCents: 2900, yearlyCents: 29000, commissionBps: 900, listingLimit: 40, featured: true });
    expect(saved.ok && saved.value.version).toBe(Math.max(...before.map((v) => v.version)) + 1);
    const after = await admin.planVersions();
    expect(after.filter((v) => v.code === 'pro').length).toBe(before.length + 1); // the old version is kept, never changed
    expect(admin.offeredNow(after).pro?.commissionBps).toBe(900);
    expect((await admin.setPlanOffered('admin-1', 'free', false)).ok).toBe(false);
  });
});
