import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  balances,
  checkWithdrawal,
  cleanSettings,
  commissionCents,
  DEFAULTS,
  earnedBadges,
  isSelfReferral,
  joinFeeCents,
  makeCode,
  maskDetails,
  orderBasisCents,
  productEligible,
  purchaseKind,
  qualifies,
  rankLeaders,
  withinWindow,
} from '@/lib/affiliates/rules';
// @ts-expect-error plain JavaScript module without types
import { forPglite, migrationFiles, STAND_INS } from '../../scripts/lib/pgliteSupabase.mjs';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => undefined) }));
const orders = new Map<string, Record<string, unknown>>();
vi.mock('@/lib/orders/service', async (orig) => ({ ...(await orig<object>()), getOrder: vi.fn(async (id: string) => orders.get(id) ?? null) }));
const sellerSubs = new Map<string, Record<string, unknown>>();
vi.mock('@/lib/plans/store', async (orig) => ({ ...(await orig<object>()), subscriptionById: vi.fn(async (id: string) => sellerSubs.get(id) ?? null) }));

const DAY = 86_400_000;

describe('affiliate rules (owner, 2026-11-12)', () => {
  it('defaults match the brief and the program starts off', () => {
    expect(DEFAULTS.enabled).toBe(false);
    expect([DEFAULTS.feeCents, DEFAULTS.promoFeeCents, DEFAULTS.qualificationDays, DEFAULTS.targetSales]).toEqual([1500, 0, 60, 3]);
    expect(DEFAULTS.rates).toEqual({ first_purchase: 1500, repeat_purchase: 500, buyer_sub_new: 1500, buyer_sub_renewal: 500, seller_sub: 1000 });
    expect([DEFAULTS.cookieDays, DEFAULTS.minWithdrawalCents]).toEqual([60, 5000]);
    expect(DEFAULTS.badges.map((b) => b.key)).toEqual(['verified', 'sales-10', 'sales-25', 'sales-50', 'sales-100', 'champion']);
  });
  it('cleans junk settings back to safe values', () => {
    const s = cleanSettings({ enabled: 'yes', feeCents: -5, rates: { first_purchase: 99999 }, cookieDays: 0, eligible: { mode: 'list', include: ['ok-site', 'BAD SITE'] } });
    expect(s.enabled).toBe(false);
    expect(s.feeCents).toBe(1500);
    expect(s.rates.first_purchase).toBe(1500);
    expect(s.cookieDays).toBe(60);
    expect(s.eligible).toEqual({ mode: 'list', include: ['ok-site'], exclude: [] });
  });
  it('fee: the promotion price while it runs, else the standard fee', () => {
    expect(joinFeeCents(DEFAULTS)).toBe(0);
    expect(joinFeeCents({ ...DEFAULTS, promoActive: false })).toBe(1500);
  });
  it('commission on the net basis, without domains, hosting or tax, less refunds, rounded down', () => {
    const basis = orderBasisCents({
      lines: [
        ['Website', 10000],
        ['Domain example.com', 1500],
        ['Hosting 1 year', 4000],
        ['Tax', 800],
        ['Express delivery', 1500],
      ],
      refundedCents: 1000,
    });
    expect(basis).toBe(10500);
    expect(commissionCents(basis, 1500)).toBe(1575);
    expect(commissionCents(333, 1500)).toBe(49);
    expect(commissionCents(-5, 1500)).toBe(0);
  });
  it('first and repeat purchases, eligibility, self-referral and the cookie window', () => {
    expect(purchaseKind(0)).toBe('first_purchase');
    expect(purchaseKind(2)).toBe('repeat_purchase');
    const list = { ...DEFAULTS, eligible: { mode: 'list' as const, include: ['a'], exclude: ['b'] } };
    expect([
      productEligible(list, 'a'),
      productEligible(list, 'c'),
      productEligible(DEFAULTS, 'c'),
      productEligible({ ...DEFAULTS, eligible: { mode: 'all', include: [], exclude: ['c'] } }, 'c'),
    ]).toEqual([true, false, true, false]);
    expect(isSelfReferral(DEFAULTS, 'u1', 'u1')).toBe(true);
    expect(isSelfReferral(DEFAULTS, 'u1', 'u2')).toBe(false);
    const now = Date.now();
    expect(withinWindow(DEFAULTS, now - 59 * DAY, now)).toBe(true);
    expect(withinWindow(DEFAULTS, now - 61 * DAY, now)).toBe(false);
    expect(withinWindow(DEFAULTS, now + DAY, now)).toBe(false);
  });
  it('qualification, badges and the leaderboard', () => {
    const now = Date.now();
    expect(qualifies(DEFAULTS, { status: 'pending', qualificationEndsAt: now + DAY }, 3, now)).toBe(true);
    expect(qualifies(DEFAULTS, { status: 'pending', qualificationEndsAt: now - 1 }, 3, now)).toBe(false);
    expect(qualifies(DEFAULTS, { status: 'pending', qualificationEndsAt: now + DAY }, 2, now)).toBe(false);
    expect(earnedBadges(DEFAULTS, { status: 'qualified' }, 26, 0).map((b) => b.key)).toEqual(['verified', 'sales-10', 'sales-25']);
    expect(earnedBadges(DEFAULTS, { status: 'pending' }, 9, 1).map((b) => b.key)).toEqual(['champion']);
    const r = rankLeaders([
      { affiliateId: '1', name: 'B', sales: 3, netCents: 100, qualified: true, public: true },
      { affiliateId: '2', name: 'A', sales: 3, netCents: 900, qualified: true, public: true },
      { affiliateId: '3', name: 'C', sales: 0, netCents: 0, qualified: false, public: true },
      { affiliateId: '4', name: 'D', sales: 5, netCents: 0, qualified: false, public: true },
    ]);
    expect(r.map((x) => x.affiliateId)).toEqual(['4', '2', '1']);
  });
  it('balances and withdrawals', () => {
    const l = [
      { kind: 'commission', amount_cents: 6000 },
      { kind: 'commission', amount_cents: 2000 },
      { kind: 'reversal', amount_cents: -2000 },
      { kind: 'withdrawal', amount_cents: -1000 },
    ];
    expect(balances(l, 0)).toEqual({ earnedCents: 8000, reversedCents: 2000, paidCents: 1000, availableCents: 5000 });
    expect(balances(l, 5000).availableCents).toBe(0);
    expect(checkWithdrawal(DEFAULTS, 4999, 9000)).toMatch(/minimum/);
    expect(checkWithdrawal(DEFAULTS, 6000, 5000)).toMatch(/more than/);
    expect(checkWithdrawal(DEFAULTS, 5000, 5000)).toBeNull();
    expect(makeCode()).toMatch(/^AFF[A-Z2-9]{6}$/);
    expect(maskDetails('me@example.com')).toBe('••••.com');
  });
});

describe('affiliate program in memory (demo, before migration 0086)', () => {
  beforeEach(() => orders.clear());
  it('join, click, attribute, commission, approval, qualification, reversal and one payout', async () => {
    const svc = await import('@/lib/affiliates/service');
    expect((await svc.joinProgram('aff-user', 'Web Picks', true)).ok).toBe(false); // off by default
    await svc.saveAffSettings(null, { ...DEFAULTS, enabled: true, targetSales: 2, holdDays: 7 });
    expect((await svc.joinProgram('aff-user', 'Web Picks', false)).ok).toBe(false); // terms needed
    const joined = await svc.joinProgram('aff-user', 'Web Picks', true);
    if (!joined.ok) throw new Error(joined.error);
    const again = await svc.joinProgram('aff-user', 'Other', true);
    expect(again.ok && again.value.id).toBe(joined.value.id); // no duplicate account
    expect(joined.value.status).toBe('pending');
    expect(joined.value.feeCents).toBe(0);

    const click = await svc.recordClick(joined.value.code, 'shop-one', 'visitor-hash');
    if (!click.ok) throw new Error(click.error);
    expect(svc.readRef(click.value.cookie)?.code).toBe(joined.value.code);
    expect(svc.readRef(click.value.cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull(); // tampered cookie
    const ref = svc.readRef(click.value.cookie)!;

    const now = Date.now();
    const accepted = now - 10 * DAY;
    const order = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      fundedAt: now - 12 * DAY,
      acceptedAt: accepted,
      priceCents: 10000,
      productKey: 'shop-one',
      state: 'accepted',
      lines: [
        ['Website', 10000],
        ['Domain', 1500],
      ],
      refundedCents: 0,
      buyerId: 'buyer-1',
      createdAt: now - 12 * DAY,
      ...extra,
    });
    orders.set('o1', order('o1'));
    orders.set('o2', order('o2'));
    orders.set('o3', order('o3', { state: 'in_delivery', acceptedAt: null }));
    expect(await svc.attribute('order', 'o1', 'aff-user', 'shop-one', ref)).toBe(false); // self-referral
    expect(await svc.attribute('order', 'o1', 'buyer-1', 'shop-one', ref)).toBe(true);
    expect(await svc.attribute('order', 'o1', 'buyer-1', 'shop-one', ref)).toBe(false); // first affiliate wins, once
    expect(await svc.attribute('order', 'o2', 'buyer-1', 'shop-one', ref)).toBe(true);
    expect(await svc.attribute('order', 'o3', 'buyer-2', 'shop-one', ref)).toBe(true);
    expect(await svc.attribute('order', 'o9', 'buyer-1', 'shop-one', { ...ref, issuedAt: now - 70 * DAY })).toBe(false); // cookie too old

    const run1 = await svc.runAffiliateJobs(now);
    expect(run1.made).toBe(3);
    const run2 = await svc.runAffiliateJobs(now); // approved on the next run, after the hold
    expect(run2.approved).toBe(2);
    expect(run2.qualified).toBe(1);
    const comms = await svc.allCommissions();
    expect(comms.filter((c) => c.status === 'approved').every((c) => c.amountCents === 1500 && c.basisCents === 10000)).toBe(true);
    expect((await svc.affiliateById(joined.value.id))?.status).toBe('qualified');

    // a rate change is not retroactive
    await svc.saveAffSettings(null, { ...(await svc.affSettings()), rates: { ...DEFAULTS.rates, first_purchase: 9000 } });
    await svc.runAffiliateJobs(now);
    expect((await svc.allCommissions()).every((c) => c.rateBps === 1500)).toBe(true);
    expect((await svc.runAffiliateJobs(now)).approved).toBe(0); // approving twice does nothing

    // a refund reverses an approved commission and its ledger money
    orders.set('o2', order('o2', { state: 'refunded', refundedCents: 10000 }));
    expect((await svc.runAffiliateJobs(now)).reversed).toBe(1);
    let d = await svc.dashboardOf('aff-user');
    expect(d?.availableCents).toBe(1500);
    expect(d?.verifiedSales).toBe(1);

    // withdrawals: minimum, payout method, one open at a time, paid once
    await svc.saveAffSettings(null, { ...(await svc.affSettings()), minWithdrawalCents: 1000 });
    expect((await svc.requestWithdrawal('aff-user', 1500)).ok).toBe(false); // no payout method
    await svc.updateProfile('aff-user', { payoutMethod: 'PayPal', payoutDetails: 'me@example.com' });
    expect((await svc.requestWithdrawal('aff-user', 500)).ok).toBe(false); // below minimum
    const w = await svc.requestWithdrawal('aff-user', 1500);
    if (!w.ok) throw new Error(w.error);
    expect((await svc.requestWithdrawal('aff-user', 1000)).ok).toBe(false); // one open request
    expect((await svc.decideWithdrawal('admin', w.value.id, 'paid', 'REF-1')).ok).toBe(false); // approve first
    expect((await svc.decideWithdrawal('admin', w.value.id, 'approve', '')).ok).toBe(true);
    expect((await svc.decideWithdrawal('admin', w.value.id, 'paid', 'PP-123')).ok).toBe(true);
    expect((await svc.decideWithdrawal('admin', w.value.id, 'paid', 'PP-123')).ok).toBe(false); // never twice
    d = await svc.dashboardOf('aff-user');
    expect([d?.availableCents, d?.paidCents]).toEqual([0, 1500]);

    // turning the program off stops new referrals but keeps the money and the jobs
    await svc.saveAffSettings(null, { ...(await svc.affSettings()), enabled: false });
    expect((await svc.recordClick(joined.value.code, '', 'v2')).ok).toBe(false);
    expect(await svc.attribute('order', 'o7', 'buyer-1', '', ref)).toBe(false);
    orders.set('o3', order('o3'));
    expect((await svc.runAffiliateJobs(now)).approved).toBe(1);
    expect((await svc.leaderboard()).length).toBeGreaterThanOrEqual(0);
    expect(await svc.exportCsv()).toMatch(/^code,display_name/);
  });
});

describe('migration 0086 on a real Postgres (every migration, never production)', () => {
  it('server-only tables, unique keys, one open withdrawal, append-only ledger', async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(STAND_INS);
    for (const f of migrationFiles() as { sql: string }[]) await db.exec(forPglite(f.sql));
    const user = crypto.randomUUID();
    await db.query('insert into auth.users (id, email) values ($1, $2)', [user, 'a@example.test']);
    await db.query('insert into profiles (id) values ($1) on conflict (id) do nothing', [user]);
    const aff = (
      await db.query<{ id: string }>(
        `insert into affiliates (user_id, code, qualification_started_at, qualification_ends_at, terms_version) values ($1, 'AFFTEST1', now(), now() + interval '60 days', 'v1') returning id`,
        [user],
      )
    ).rows[0].id;
    await expect(
      db.query(`insert into affiliates (user_id, code, qualification_started_at, qualification_ends_at, terms_version) values ($1, 'AFFTEST2', now(), now(), 'v1')`, [user]),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into affiliates (user_id, code, qualification_started_at, qualification_ends_at, terms_version) values ($1, 'bad code', now(), now(), 'v1')`, [crypto.randomUUID()]),
    ).rejects.toThrow();
    const at = (await db.query<{ id: string }>(`insert into affiliate_attributions (affiliate_id, kind, ref_id) values ($1, 'order', 'o1') returning id`, [aff])).rows[0].id;
    await expect(db.query(`insert into affiliate_attributions (affiliate_id, kind, ref_id) values ($1, 'order', 'o1')`, [aff])).rejects.toThrow();
    const comm = `insert into affiliate_commissions (affiliate_id, attribution_id, kind, source_ref, basis_cents, rate_bps, amount_cents) values ($1, $2, 'first_purchase', 'order:o1', 10000, 1500, 1500)`;
    await db.query(comm, [aff, at]);
    await expect(db.query(comm, [aff, at])).rejects.toThrow();
    const wd = `insert into affiliate_withdrawals (affiliate_id, amount_cents, method, details_masked) values ($1, 5000, 'PayPal', '••••.com')`;
    await db.query(wd, [aff]);
    await expect(db.query(wd, [aff])).rejects.toThrow(); // one open withdrawal
    const led = `insert into affiliate_ledger (affiliate_id, entry_key, kind, amount_cents) values ($1, 'commission:x', 'commission', 1500)`;
    await db.query(led, [aff]);
    await expect(db.query(led, [aff])).rejects.toThrow(); // one entry per key
    await expect(db.query(`update affiliate_ledger set amount_cents = 1`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from affiliate_ledger`)).rejects.toThrow(/append-only/);
    await db.close();
  }, 180_000);
  it('grants nothing to anon or signed-in clients', () => {
    const sql = readFileSync('supabase/migrations/0086_affiliates.sql', 'utf8');
    expect(sql).not.toMatch(/grant[^;]*to\s+(anon|authenticated)/i);
    expect(sql).toMatch(/enable row level security/i);
  });
});

describe('affiliate program: subscriptions, sign-ups, missed targets and the audit log (memory)', () => {
  it('pays 15% on a new buyer subscription, 5% on its renewal and 10% on a paid seller plan, once each', async () => {
    const svc = await import('@/lib/affiliates/service');
    const subs = await import('@/lib/buyerSubs/service');
    await svc.saveAffSettings(null, { ...DEFAULTS, enabled: true, holdDays: 7 });
    const j = await svc.joinProgram('aff-subs', 'Sub Picks', true);
    if (!j.ok) throw new Error(j.error);
    const ref = { code: j.value.code, issuedAt: Date.now() };

    // a sign-up is a lead, never a commission
    expect(await svc.attribute('signup', 'new-user', 'new-user', '', ref)).toBe(true);

    await subs.saveSubSettings(null, { enabled: true, intro: '', faq: [] });
    const plan = (await subs.allPlans())[0];
    const sub = await subs.subscribe('sub-buyer', plan.id, null);
    if (!sub.ok) throw new Error(sub.error);
    const p1 = await subs.submitPayment('sub-buyer', sub.value.id, { kind: 'new', methodLabel: 'Bank', reference: 'AFFNEW1', paidOn: null });
    if (!p1.ok) throw new Error(p1.error);
    await subs.decidePayment('admin', p1.value.id, true);
    const p2 = await subs.submitPayment('sub-buyer', sub.value.id, { kind: 'renewal', methodLabel: 'Bank', reference: 'AFFREN1', paidOn: null });
    if (!p2.ok) throw new Error(p2.error);
    await subs.decidePayment('admin', p2.value.id, true);
    expect(await svc.attribute('buyer_sub', sub.value.id, 'sub-buyer', '', ref)).toBe(true);

    sellerSubs.set('seller-sub-1', { id: 'seller-sub-1', status: 'active', priceCents: 4900, periodStart: Date.now() - DAY });
    sellerSubs.set('seller-sub-2', { id: 'seller-sub-2', status: 'requested', priceCents: 4900 }); // not paid yet: nothing
    expect(await svc.attribute('seller_sub', 'seller-sub-1', 'a-seller', '', ref)).toBe(true);
    expect(await svc.attribute('seller_sub', 'seller-sub-2', 'b-seller', '', ref)).toBe(true);

    const later = Date.now() + 8 * DAY;
    await svc.runAffiliateJobs(later);
    await svc.runAffiliateJobs(later);
    await svc.runAffiliateJobs(later); // more runs change nothing
    const mine = (await svc.allCommissions()).filter((c) => c.affiliateId === j.value.id);
    const by = Object.fromEntries(mine.map((c) => [c.kind, c]));
    expect(mine).toHaveLength(3);
    expect(by.buyer_sub_new).toMatchObject({ rateBps: 1500, basisCents: p1.value.amountCents, amountCents: Math.floor(p1.value.amountCents * 0.15), status: 'approved' });
    expect(by.buyer_sub_renewal).toMatchObject({ rateBps: 500, amountCents: Math.floor(p2.value.amountCents * 0.05), status: 'approved' });
    expect(by.seller_sub).toMatchObject({ rateBps: 1000, basisCents: 4900, amountCents: 490, status: 'approved' });
    const d = await svc.dashboardOf('aff-subs');
    expect(d?.signups).toBe(1);
    expect(d?.availableCents).toBe(mine.reduce((s, c) => s + c.amountCents, 0));
    // leaderboard: ranked this month; an affiliate who opts out leaves the public board but keeps their place in the admin one
    const month = new Date(later).toISOString().slice(0, 7);
    expect((await svc.leaderboard(month, true)).some((r) => r.affiliateId === j.value.id)).toBe(true);
    await svc.updateProfile('aff-subs', { publicLeaderboard: false });
    expect((await svc.leaderboard(month, true)).some((r) => r.affiliateId === j.value.id)).toBe(false);
    expect((await svc.leaderboard(month, false)).some((r) => r.affiliateId === j.value.id)).toBe(true);
    await subs.saveSubSettings(null, { enabled: false, intro: '', faq: [] });
  });

  it('a missed target charges nothing; an admin can restart the window; every admin decision is audited', async () => {
    const svc = await import('@/lib/affiliates/service');
    await svc.saveAffSettings('admin-1', { ...DEFAULTS, enabled: true, promoActive: false });
    const j = await svc.joinProgram('aff-miss', 'Slow Start', true);
    if (!j.ok) throw new Error(j.error);
    expect([j.value.feeCents, j.value.feeWaived]).toEqual([1500, false]); // recorded, never charged
    await svc.runAffiliateJobs(Date.now() + 61 * DAY);
    expect((await svc.affiliateById(j.value.id))?.status).toBe('pending');
    const d = await svc.dashboardOf('aff-miss');
    expect([d?.availableCents, d?.totalEarnedCents, d?.paidCents]).toEqual([0, 0, 0]);
    const r = await svc.adminQualification('admin-1', j.value.id, 'restart', 60);
    expect(r.ok && r.value.qualificationEndsAt).toBeGreaterThan(Date.now() + 59 * DAY);
    expect((await svc.adminMoveAffiliate('admin-1', j.value.id, 'suspended', 'test')).ok).toBe(true);
    expect((await svc.recordClick(j.value.code, '', 'v-s')).ok).toBe(false); // a suspended affiliate's links stop
    expect((await svc.adminMoveAffiliate('admin-1', j.value.id, 'pending', 'reactivated')).ok).toBe(true);
    const log = ((globalThis as { __auditMem?: { action: string }[] }).__auditMem ?? []).map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(['affiliates_on', 'affiliate_qualification_restart', 'affiliate_suspended', 'affiliate_pending', 'affiliate_withdrawal_paid']));
    await svc.saveAffSettings('admin-1', { ...DEFAULTS });
  });
});

describe('migration 0086: client access and the rollback script (in-process Postgres)', () => {
  it('anon and signed-in roles cannot read or write; the rollback removes only the affiliate tables and 0086 applies again', async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    await db.exec(STAND_INS);
    const files = migrationFiles() as { sql: string }[];
    for (const f of files) await db.exec(forPglite(f.sql));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const t of ['affiliates', 'affiliate_ledger', 'affiliate_commissions', 'affiliate_withdrawals', 'affiliate_clicks'])
        await expect(db.query(`select count(*) from ${t}`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`insert into affiliate_ledger (affiliate_id, entry_key, kind, amount_cents) values (gen_random_uuid(), 'x', 'commission', 1)`)).rejects.toThrow(/permission denied/);
      await db.exec('reset role');
    }
    const count = async () => (await db.query<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`)).rows[0].n;
    const before = await count();
    await db.exec(readFileSync('supabase/rollback/0086_affiliates_down.sql', 'utf8'));
    expect((await db.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'affiliate%'`)).rows).toEqual([]);
    expect(before - (await count())).toBe(7);
    await db.query('select 1 from orders limit 1'); // the rest is untouched
    const m86 = files.find((f) => f.sql.includes('create table if not exists affiliate_ledger'))!;
    await db.exec(forPglite(m86.sql)); // and the migration applies again
    expect((await db.query<{ n: number }>('select count(*)::int as n from affiliates')).rows[0].n).toBe(0);
    await db.close();
  }, 180_000);
});
