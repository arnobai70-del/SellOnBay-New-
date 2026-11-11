import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { describe, expect, it, vi } from 'vitest';
import {
  subscribable,
  activation,
  ADMIN_MOVES,
  checkPlan,
  DAY,
  dueForReminder,
  eligible,
  priceWithCoupon,
  renewedUntil,
  shownPlans,
  snapshotOf,
  type Plan,
  type Subscription,
} from '@/lib/buyerSubs/rules';
// @ts-expect-error plain JavaScript module without types
import { forPglite, migrationFiles, STAND_INS } from '../../scripts/lib/pgliteSupabase.mjs';

vi.mock('server-only', () => ({}));

const base = {
  key: 'pro',
  name: 'Pro',
  priceCents: 14900,
  renewalCents: 7900,
  period: 'year',
  websiteLimit: 3,
  supportDays: 365,
  benefits: [{ text: 'Full source code', on: true }],
  features: { source_code: true },
};

/* Buyer subscriptions (owner, 2026-11-12): the rules are pure; every value comes from the admin panel. */
describe('buyer subscription rules', () => {
  it('checks an admin plan form', () => {
    const ok = checkPlan(base);
    expect(ok.ok && ok.value.periodDays).toBe(365);
    expect(checkPlan({ ...base, key: 'Bad Key' }).ok).toBe(false);
    expect(checkPlan({ ...base, priceCents: -1 }).ok).toBe(false);
    expect(checkPlan({ ...base, period: 'custom', periodDays: 90 }).ok && checkPlan({ ...base, period: 'custom', periodDays: 90 })).toMatchObject({ value: { periodDays: 90 } });
    expect(checkPlan({ ...base, color: 'red' }).ok).toBe(false);
  });

  it('prices with a live coupon only, never below zero', () => {
    const coupons = [
      { code: 'SAVE20', percentOff: 20, endsOn: null, maxUses: null, active: true },
      { code: 'OLD', percentOff: 50, endsOn: '2020-01-01', maxUses: null, active: true },
    ];
    expect(priceWithCoupon(14900, 'save20', coupons, '2026-11-12').cents).toBe(11920);
    expect(priceWithCoupon(14900, 'OLD', coupons, '2026-11-12').error).toBeTruthy();
    expect(priceWithCoupon(14900, '', coupons, '2026-11-12').cents).toBe(14900);
  });

  it('decides which websites a plan may include', () => {
    const all = { mode: 'all' as const, categories: ['portfolio'], include: ['p-keep'], exclude: ['shop-no'] };
    expect(eligible(all, { id: 'a', category: 'saas' })).toBe(true);
    expect(eligible(all, { id: 'b', category: 'portfolio' })).toBe(false);
    expect(eligible(all, { id: 'p-keep', category: 'portfolio' })).toBe(true);
    expect(eligible(all, { id: 'shop-no', category: 'saas' })).toBe(false);
    const list = { mode: 'list' as const, categories: ['saas'], include: [], exclude: [] };
    expect(eligible(list, { id: 'a', category: 'saas' })).toBe(true);
    expect(eligible(list, { id: 'b', category: 'business' })).toBe(false);
  });

  it('starts, renews from the later end, and reminds once per term', () => {
    const v = checkPlan(base);
    if (!v.ok) throw new Error(v.error);
    const snap = snapshotOf({ ...v.value, id: 'x', archivedAt: null } as Plan);
    const now = Date.parse('2026-11-12T00:00:00Z');
    const a = activation(snap, now);
    expect(a.creditsTotal).toBe(3);
    expect(a.expiresAt - a.startsAt).toBe(365 * DAY);
    expect(renewedUntil(snap, a.expiresAt, now)).toBe(a.expiresAt + 365 * DAY); // renewal adds to the current end
    expect(renewedUntil(snap, now - 10 * DAY, now)).toBe(now + 365 * DAY); // an ended plan starts again from today
    const sub = { status: 'active', startsAt: a.startsAt, expiresAt: now + 10 * DAY, remindedAt: null } as unknown as Subscription;
    expect(dueForReminder(sub, now)).toBe(true);
    expect(dueForReminder({ ...sub, remindedAt: now }, now)).toBe(false);
  });

  it('only allows the listed admin moves, and hides inactive, hidden or archived plans', () => {
    expect(ADMIN_MOVES.active).toEqual(['suspended', 'cancelled']);
    expect(ADMIN_MOVES.cancelled).toEqual([]);
    const v = checkPlan(base);
    if (!v.ok) throw new Error(v.error);
    const p = { ...v.value, id: '1', archivedAt: null } as Plan;
    expect(shownPlans([p, { ...p, id: '2', active: false }, { ...p, id: '3', visible: false }, { ...p, id: '4', archivedAt: 1 }]).map((x) => x.id)).toEqual(['1']);
  });
});

describe('owner decisions (2026-11-12)', () => {
  it('only SellOnBay websites can be chosen; third-party sellers are never offered', () => {
    expect(subscribable({ ownerType: 'platform' })).toBe(true);
    expect(subscribable({ ownerType: 'seller' })).toBe(false);
    expect(subscribable({})).toBe(false);
  });
  it('a website chosen with a subscription is marked Subscription, not Free beta', async () => {
    const { insertBetaOrder } = await import('@/lib/orders/service');
    const base = { title: 'X', buyerId: 'b', sellerId: null, productKey: 'x', deliveryType: 'download' as const, days: 3, licence: 'standard', meta: {} };
    expect((await insertBetaOrder({ ...base, via: 'subscription' }, Date.now())).payment?.ref).toBe('subscription');
    expect((await insertBetaOrder(base, Date.now())).payment?.ref).toBe('beta_free');
  });
});

describe('buyer subscriptions in memory (demo, before migration 0085)', () => {
  it('subscribe needs the feature on; pay, verify, extend and expire follow the rules', async () => {
    const s = await import('@/lib/buyerSubs/service');
    const plan = (await s.allPlans())[0];
    expect((await s.subscribe('buyer-1', plan.id, null)).ok).toBe(false); // off by default
    await s.saveSubSettings(null, { enabled: true, intro: '', faq: [] });
    const sub = await s.subscribe('buyer-1', plan.id, null);
    if (!sub.ok) throw new Error(sub.error);
    expect(sub.value.status).toBe('pending_payment');
    expect(sub.value.amountCents).toBe(plan.priceCents);
    expect((await s.submitPayment('someone-else', sub.value.id, { kind: 'new', methodLabel: 'Bank', reference: 'TRX123', paidOn: null })).ok).toBe(false);
    const pay = await s.submitPayment('buyer-1', sub.value.id, { kind: 'new', methodLabel: 'Bank', reference: 'TRX123', paidOn: '2026-11-12' });
    if (!pay.ok) throw new Error(pay.error);
    expect((await s.submitPayment('buyer-1', sub.value.id, { kind: 'renewal', methodLabel: 'Bank', reference: 'TRX123', paidOn: null })).ok).toBe(false); // same reference
    const now = Date.now();
    const active = await s.decidePayment('admin-1', pay.value.id, true, now);
    if (!active.ok) throw new Error(active.error);
    expect(active.value.status).toBe('active');
    expect(active.value.creditsTotal).toBe(plan.websiteLimit);
    const ext = await s.adminExtend('admin-1', sub.value.id, 10, now);
    expect(ext.ok && ext.value.expiresAt).toBe(active.value.expiresAt! + 10 * DAY);
    expect((await s.adminMove('admin-1', sub.value.id, 'rejected', 'x')).ok).toBe(false); // not a legal move from active
    const jobs = await s.runSubJobs(ext.ok ? ext.value.expiresAt! + 1 : now);
    expect(jobs.expired).toBe(1);
    expect((await s.subById(sub.value.id))?.status).toBe('expired');
  });
});

describe('buyer_sub_take_credit on a real Postgres (every migration, never production)', () => {
  it('never takes more credits than the plan has, and refuses an ended subscription', { timeout: 180_000 }, async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(STAND_INS);
    for (const f of migrationFiles() as { sql: string }[]) await db.exec(forPglite(f.sql));
    const buyer = crypto.randomUUID();
    await db.query('insert into auth.users (id, email) values ($1, $2)', [buyer, 'b@example.test']);
    await db.query('insert into profiles (id) values ($1) on conflict (id) do nothing', [buyer]);
    const plan = (await db.query<{ id: string }>(`select id from buyer_sub_plans where key = 'pro'`)).rows[0].id;
    const sub = (
      await db.query<{ id: string }>(
        `insert into buyer_subscriptions (buyer_id, plan_id, plan_snapshot, status, credits_total, amount_cents, starts_at, expires_at)
         values ($1, $2, '{}', 'active', 1, 14900, now(), now() + interval '1 year') returning id`,
        [buyer, plan],
      )
    ).rows[0].id;
    expect((await db.query<{ n: number }>('select buyer_sub_take_credit($1, $2) as n', [sub, buyer])).rows[0].n).toBe(0);
    await expect(db.query('select buyer_sub_take_credit($1, $2)', [sub, buyer])).rejects.toThrow(/no_credits/);
    await expect(db.query('select buyer_sub_take_credit($1, $2)', [sub, crypto.randomUUID()])).rejects.toThrow(/not_found/);
    await db.query(`update buyer_subscriptions set expires_at = now() - interval '1 day', credits_used = 0 where id = $1`, [sub]);
    await expect(db.query('select buyer_sub_take_credit($1, $2)', [sub, buyer])).rejects.toThrow(/not_active/);
    await expect(db.query(`update buyer_sub_events set event = 'x'`)).resolves.toBeDefined(); // no rows yet
    await db.query(`insert into buyer_sub_events (subscription_id, event) values ($1, 'test')`, [sub]);
    await expect(db.query(`delete from buyer_sub_events`)).rejects.toThrow(/append-only/);
    expect((await db.query<{ n: number }>(`select count(*)::int as n from buyer_sub_plans`)).rows[0].n).toBe(3);
    await db.close();
  });
});
