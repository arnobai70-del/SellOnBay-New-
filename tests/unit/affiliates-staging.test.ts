import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/*
 * The affiliate program against the REAL staging Supabase project (owner, 2026-11-12: verify the money before activation). Runs only with
 * AFF_STAGING=1 and the staging credentials in ~/.sob-staging/app.env.json; it refuses any project but staging (never production).
 * It runs the app's own server code (the same functions the routes call) through supabase-js and PostgREST, with real accounts made by the
 * admin API (example.test addresses, confirmed, so no email is sent), real sign-in, real concurrent connections and the real grants.
 * Everything it makes is marked "[TEST]" / "aff-staging-"; the program setting is switched off again at the end.
 *   AFF_STAGING=1 npx vitest run tests/unit/affiliates-staging.test.ts
 */
const STAGING = 'occketfmjwciilzuddkv';
const PRODUCTION = 'knvxtgzrylvkhyrcezlq';
const file = path.join(homedir(), '.sob-staging', 'app.env.json');
const RUN = process.env.AFF_STAGING === '1' && existsSync(file);
const env = RUN ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>) : {};
if (RUN) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!url.includes(`${STAGING}.supabase.co`) || url.includes(PRODUCTION) || (env.SUPABASE_SERVICE_ROLE_KEY ?? '').includes(PRODUCTION))
    throw new Error('affiliates-staging: the credentials are not the staging project; stopping.');
  // set before any app module is imported (lib/supabase/env.ts reads them once)
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.LAUNCHBAY_DEMO = '';
}
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], set() {} }), headers: async () => new Headers() }));

const DAY = 86_400_000;
const tag = `aff-staging-${Date.now().toString(36)}`;
const password = `T3st-${crypto.randomUUID()}`;
let admin: SupabaseClient;
const users: Record<'aff' | 'buyer' | 'buyer2' | 'other', string> = { aff: '', buyer: '', buyer2: '', other: '' };

async function makeUser(name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: `${tag}-${name}@example.test`, password, email_confirm: true, user_metadata: { full_name: `[TEST] ${name}`, test: tag } });
  if (error || !data.user) throw new Error(`createUser ${name}: ${error?.message}`);
  return data.user.id;
}

describe.skipIf(!RUN)('affiliates on the real staging Supabase', () => {
  beforeAll(async () => {
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    for (const k of Object.keys(users) as (keyof typeof users)[]) users[k] = await makeUser(k);
  }, 120_000);

  afterAll(async () => {
    if (!RUN) return;
    const svc = await import('@/lib/affiliates/service');
    await svc.saveAffSettings(null, { enabled: false }); // the program stays off on staging too
  });

  it('the migrations are in: the functions exist, browsers are refused, and the app role cannot write money directly', async () => {
    // PostgREST resolves the functions by the exact parameter names the app sends; a browser key is refused, not "not found"
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    for (const [fn, args] of [
      ['affiliate_approve_commission', { p_id: crypto.randomUUID(), p_at: new Date().toISOString() }],
      ['affiliate_reverse_commission', { p_id: crypto.randomUUID(), p_reason: 'x', p_at: new Date().toISOString() }],
      ['affiliate_request_withdrawal', { p_affiliate: crypto.randomUUID(), p_amount: 100, p_min: 100, p_method: 'x', p_masked: 'x' }],
      ['affiliate_decide_withdrawal', { p_id: crypto.randomUUID(), p_action: 'approve', p_reference: '', p_admin: null, p_at: new Date().toISOString() }],
    ] as const) {
      const { error } = await anon.rpc(fn, args);
      expect(error?.code, fn).toBe('42501'); // permission denied (PGRST202 would mean the name or parameters do not match)
      const { error: own } = await admin.rpc(fn, args);
      expect(own?.code ?? 'ok', `${fn} as the server`).not.toBe('PGRST202');
    }
    // the server's key can read but not write the ledger and withdrawals, and delete nothing
    expect((await admin.from('affiliate_ledger').select('id').limit(1)).error).toBeNull();
    expect((await admin.from('affiliate_ledger').insert({ affiliate_id: crypto.randomUUID(), entry_key: `x:${tag}`, kind: 'commission', amount_cents: 1 })).error?.code).toBe('42501');
    expect((await admin.from('affiliate_withdrawals').insert({ affiliate_id: crypto.randomUUID(), amount_cents: 1 })).error?.code).toBe('42501');
    expect((await admin.from('affiliates').delete().eq('id', crypto.randomUUID())).error?.code).toBe('42501');
  }, 60_000);

  it('real sign-in: a signed-in account reads no affiliate data and cannot call the money functions', async () => {
    const browser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await browser.auth.signInWithPassword({ email: `${tag}-other@example.test`, password });
    expect(error).toBeNull();
    expect(data.user?.id).toBe(users.other);
    for (const t of ['affiliates', 'affiliate_commissions', 'affiliate_ledger', 'affiliate_withdrawals', 'affiliate_clicks']) {
      const r = await browser.from(t).select('*').limit(1);
      expect(r.error?.code, t).toBe('42501');
    }
    expect((await browser.rpc('affiliate_approve_commission', { p_id: crypto.randomUUID(), p_at: new Date().toISOString() })).error?.code).toBe('42501');
    await browser.auth.signOut();
  }, 60_000);

  it('a referred order: commission made, approved after acceptance, once; 10 racing withdrawals reserve once; 10 racing payouts book once', async () => {
    const svc = await import('@/lib/affiliates/service');
    const orders = await import('@/lib/orders/service');
    expect((await svc.saveAffSettings(null, { enabled: true, holdDays: 0, minWithdrawalCents: 500, targetSales: 1 })).ok).toBe(true);
    const j = await svc.joinProgram(users.aff, '[TEST] Staging Picks', true);
    if (!j.ok) throw new Error(j.error);
    expect((await admin.from('affiliates').select('status, fee_cents, terms_version').eq('id', j.value.id).single()).data).toMatchObject({ status: 'pending', fee_cents: 0 });
    const ref = { code: j.value.code, issuedAt: Date.now() };

    const o = await orders.createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      title: `[TEST] ${tag} order`,
      lines: [
        ['Website', 10000],
        ['Domain registration', 1500],
      ],
      days: 3,
      buyerId: users.buyer,
      productKey: `${tag}-site`,
    });
    expect(await svc.attribute('order', o.id, users.aff, `${tag}-site`, ref)).toBe(false); // self-referral
    expect(await svc.attribute('order', o.id, users.buyer, `${tag}-site`, ref)).toBe(true);
    for (const to of ['funded', 'delivered', 'accepted'] as const) {
      const r = await orders.move(o.id, to, { actorId: null, event: `test_${to}`, meta: { test: tag } });
      if (!r.ok) throw new Error(`move to ${to}: ${r.error}`);
    }
    await svc.runAffiliateJobs();
    const run2 = await Promise.all([svc.runAffiliateJobs(), svc.runAffiliateJobs(), svc.runAffiliateJobs()]); // racing job runs
    expect(run2.reduce((s, r) => s + r.approved, 0)).toBeLessThanOrEqual(1);
    const comm = (await admin.from('affiliate_commissions').select('*').eq('source_ref', `order:${o.id}`)).data!;
    expect(comm).toHaveLength(1);
    expect(comm[0]).toMatchObject({ status: 'approved', basis_cents: 10000, rate_bps: 1500, amount_cents: 1500 }); // the domain is not in the basis
    expect((await admin.from('affiliate_ledger').select('amount_cents').eq('entry_key', `commission:${comm[0].id}`)).data).toEqual([{ amount_cents: 1500 }]);
    expect((await svc.affiliateById(j.value.id))?.status).toBe('qualified');

    // withdrawals: payout method, then 10 at once reserve only one
    await svc.updateProfile(users.aff, { payoutMethod: 'PayPal', payoutDetails: `${tag}@example.test` });
    const tries = await Promise.all(Array.from({ length: 10 }, () => svc.requestWithdrawal(users.aff, 1000)));
    expect(tries.filter((t) => t.ok)).toHaveLength(1);
    expect(tries.filter((t) => !t.ok).every((t) => !t.ok && t.status === 409)).toBe(true);
    const w = tries.find((t) => t.ok)!;
    if (!w.ok) throw new Error('no withdrawal');
    expect((await svc.decideWithdrawal(null, w.value.id, 'paid', 'PP-1')).ok).toBe(false); // approve first
    expect((await svc.decideWithdrawal(null, w.value.id, 'approve', '')).ok).toBe(true);
    const pays = await Promise.all(Array.from({ length: 10 }, () => svc.decideWithdrawal(null, w.value.id, 'paid', `PP-${tag}`)));
    expect(pays.filter((p) => p.ok)).toHaveLength(1);
    expect((await admin.from('affiliate_ledger').select('amount_cents').eq('entry_key', `withdrawal:${w.value.id}`)).data).toEqual([{ amount_cents: -1000 }]);
    const d = await svc.dashboardOf(users.aff);
    expect([d?.paidCents, d?.availableCents, d?.verifiedSales]).toEqual([1000, 500, 1]);
  }, 180_000);

  it('refunds reverse: a disputed and refunded order (pending commission), and a refunded buyer subscription payment (approved commission)', async () => {
    const svc = await import('@/lib/affiliates/service');
    const orders = await import('@/lib/orders/service');
    const subs = await import('@/lib/buyerSubs/service');
    const a = await svc.affiliateOfUser(users.aff);
    if (!a) throw new Error('no affiliate');
    const ref = { code: a.code, issuedAt: Date.now() };

    // an order refunded after a dispute: its pending commission is reversed and no money moves
    const o = await orders.createOrder({
      kind: 'product',
      pkg: 'asis',
      deliveryType: 'download',
      title: `[TEST] ${tag} refund order`,
      lines: [['Website', 4000]],
      days: 3,
      buyerId: users.buyer2,
      productKey: `${tag}-site`,
    });
    expect(await svc.attribute('order', o.id, users.buyer2, `${tag}-site`, ref)).toBe(true);
    for (const to of ['funded', 'delivered'] as const) expect((await orders.move(o.id, to, { actorId: null, event: `test_${to}` })).ok).toBe(true);
    await svc.runAffiliateJobs();
    let c = (await admin.from('affiliate_commissions').select('id, status').eq('source_ref', `order:${o.id}`).single()).data!;
    expect(c.status).toBe('pending');
    for (const to of ['disputed', 'refunded'] as const) {
      const r = await orders.move(o.id, to, { actorId: null, event: `test_${to}` });
      if (!r.ok) throw new Error(`move to ${to}: ${r.error}`);
    }
    await svc.runAffiliateJobs();
    c = (await admin.from('affiliate_commissions').select('id, status').eq('source_ref', `order:${o.id}`).single()).data!;
    expect(c.status).toBe('reversed');
    expect((await admin.from('affiliate_ledger').select('id').eq('commission_id', c.id)).data).toEqual([]);

    // a buyer subscription payment: approved, then refunded by an admin, then reversed once (money back out)
    expect((await subs.saveSubSettings(null, { enabled: true, intro: '', faq: [] })).ok).toBe(true);
    try {
      const plan = (await subs.allPlans()).find((p) => !p.archivedAt);
      if (!plan) throw new Error('no plan');
      const s = await subs.subscribe(users.buyer2, plan.id, null);
      if (!s.ok) throw new Error(s.error);
      const p = await subs.submitPayment(users.buyer2, s.value.id, { kind: 'new', methodLabel: 'Bank', reference: `TST${Date.now()}`, paidOn: null });
      if (!p.ok) throw new Error(p.error);
      expect((await subs.decidePayment(null, p.value.id, true)).ok).toBe(true);
      expect(await svc.attribute('buyer_sub', s.value.id, users.buyer2, '', ref)).toBe(true);
      await svc.runAffiliateJobs();
      await svc.runAffiliateJobs();
      let sc = (await admin.from('affiliate_commissions').select('id, status, amount_cents, rate_bps').eq('source_ref', `buyer_sub_payment:${p.value.id}`).single()).data!;
      expect(sc).toMatchObject({ status: 'approved', rate_bps: 1500, amount_cents: Math.floor(p.value.amountCents * 0.15) });
      const r = await subs.refundPayment(null, p.value.id, `[TEST] ${tag} refund`);
      if (!r.ok) throw new Error(r.error);
      await Promise.all([svc.runAffiliateJobs(), svc.runAffiliateJobs()]);
      sc = (await admin.from('affiliate_commissions').select('id, status, amount_cents, rate_bps').eq('source_ref', `buyer_sub_payment:${p.value.id}`).single()).data!;
      expect(sc.status).toBe('reversed');
      const led = (await admin.from('affiliate_ledger').select('entry_key, amount_cents').eq('commission_id', sc.id).order('id')).data!;
      expect(led.map((l) => l.amount_cents)).toEqual([sc.amount_cents, -sc.amount_cents]); // in once, out once
    } finally {
      await subs.saveSubSettings(null, { enabled: false, intro: '', faq: [] }); // buyer subscriptions stay off on staging
    }
  }, 180_000);
});

void DAY;
