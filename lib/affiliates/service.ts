import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { audit } from '../admin/audit';
import { notify } from '../notify';
import { getOrder } from '../orders/service';
import { orderStore } from '../orders/store';
import { subscriptionById } from '../plans/store';
import { derivedSecret } from '../secrets';
import { createAdminClient } from '../supabase/server';
import {
  ADMIN_MOVES,
  balances,
  checkWithdrawal,
  cleanSettings,
  commissionCents,
  DEFAULTS,
  earnedBadges,
  isCode,
  isSelfReferral,
  joinFeeCents,
  makeCode,
  maskDetails,
  mayEarn,
  orderBasisCents,
  productEligible,
  purchaseKind,
  qualifies,
  rankLeaders,
  withinWindow,
  type AffStatus,
  type CommissionKind,
  type LeaderRow,
  type Settings,
} from './rules';

/*
 * The affiliate program, server side (owner, 2026-11-12). A separate system: it reads orders, buyer subscription payments and seller plans to
 * see what a referral led to, and never changes any of them. Tables from migration 0086 (server only); before it is applied, or without a
 * database, everything runs in memory so the pages work in the demo. Money moves only through the append-only ledger, one entry per key.
 * Every admin decision is in the audit log and the program's own history (affiliate_events).
 */
type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const ok = <T>(value: T) => ({ ok: true as const, value });
const DAY = 86_400_000;
const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : null);
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null);

export type Affiliate = {
  id: string;
  userId: string;
  code: string;
  displayName: string;
  publicLeaderboard: boolean;
  status: AffStatus;
  qualificationStartedAt: number;
  qualificationEndsAt: number;
  verifiedAt: number | null;
  feeCents: number;
  feeWaived: boolean;
  termsVersion: string;
  payoutMethod: string;
  payoutDetails: string;
  createdAt: number;
};
export type Attribution = { id: string; affiliateId: string; kind: 'signup' | 'order' | 'buyer_sub' | 'seller_sub'; refId: string; customerId: string | null; productKey: string; createdAt: number };
export type Commission = {
  id: string;
  affiliateId: string;
  attributionId: string;
  kind: CommissionKind;
  sourceRef: string;
  basisCents: number;
  rateBps: number;
  amountCents: number;
  status: 'pending' | 'approved' | 'reversed';
  approveAfter: number | null;
  approvedAt: number | null;
  reversedAt: number | null;
  createdAt: number;
};
export type Withdrawal = {
  id: string;
  affiliateId: string;
  amountCents: number;
  status: 'requested' | 'approved' | 'rejected' | 'paid';
  method: string;
  detailsMasked: string;
  payoutReference: string;
  createdAt: number;
  decidedAt: number | null;
  paidAt: number | null;
};
type LedgerRow = { affiliate_id: string; entry_key: string; kind: string; amount_cents: number; commission_id: string | null; withdrawal_id: string | null; at: string };
type Click = { affiliateId: string; productKey: string; visitorHash: string; day: string; at: number };

type Mem = { settings: unknown; affs: Affiliate[]; clicks: Click[]; attrs: Attribution[]; comms: Commission[]; wds: Withdrawal[]; ledger: LedgerRow[] };
const g = globalThis as { __aff?: Mem; __affPg?: { ok: boolean; at: number } };
const mem: Mem = (g.__aff ??= { settings: {}, affs: [], clicks: [], attrs: [], comms: [], wds: [], ledger: [] });

async function pg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  const c = g.__affPg;
  if (c && (c.ok || Date.now() - c.at < 30_000)) return c.ok;
  const { error } = await createAdminClient().from('affiliates').select('id').limit(1);
  g.__affPg = { ok: !error, at: Date.now() };
  return !error;
}
const db = () => createAdminClient();
async function logEvent(affiliateId: string | null, actorId: string | null, event: string, meta: Record<string, unknown> = {}) {
  if (await pg()) await db().from('affiliate_events').insert({ affiliate_id: affiliateId, actor_id: actorId, event, meta });
}

/* ---------- settings ---------- */
const KEY = 'affiliates:settings';
export async function affSettings(): Promise<Settings> {
  if (!(await pg())) return cleanSettings(mem.settings);
  const { data } = await db().from('app_settings').select('value').eq('key', KEY).maybeSingle();
  return cleanSettings(data?.value ?? {});
}
export async function saveAffSettings(adminId: string | null, raw: unknown): Promise<R<Settings>> {
  const next = cleanSettings(raw);
  const before = await affSettings();
  if (await pg()) {
    const { error } = await db().from('app_settings').upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return fail(500, 'Could not save the affiliate settings.');
  } else mem.settings = next;
  await audit(adminId, next.enabled === before.enabled ? 'affiliates_settings' : next.enabled ? 'affiliates_on' : 'affiliates_off', 'affiliates', 'settings', {
    rates: next.rates,
    fee: next.feeCents,
    promo: next.promoActive ? next.promoFeeCents : null,
    targetSales: next.targetSales,
    qualificationDays: next.qualificationDays,
    cookieDays: next.cookieDays,
    minWithdrawal: next.minWithdrawalCents,
  });
  return ok(next);
}

/* ---------- affiliates ---------- */
type AffRow = Record<string, unknown> & { id: string };
const affFrom = (r: AffRow): Affiliate => ({
  id: r.id,
  userId: String(r.user_id),
  code: String(r.code),
  displayName: String(r.display_name ?? ''),
  publicLeaderboard: !!r.public_leaderboard,
  status: r.status as AffStatus,
  qualificationStartedAt: ms(r.qualification_started_at) ?? 0,
  qualificationEndsAt: ms(r.qualification_ends_at) ?? 0,
  verifiedAt: ms(r.verified_at),
  feeCents: Number(r.fee_cents ?? 0),
  feeWaived: !!r.fee_waived,
  termsVersion: String(r.terms_version ?? ''),
  payoutMethod: String(r.payout_method ?? ''),
  payoutDetails: String(r.payout_details ?? ''),
  createdAt: ms(r.created_at) ?? 0,
});

export async function allAffiliates(): Promise<Affiliate[]> {
  if (!(await pg())) return [...mem.affs];
  const { data } = await db().from('affiliates').select('*').order('created_at', { ascending: false }).limit(2000);
  return ((data ?? []) as AffRow[]).map(affFrom);
}
export async function affiliateOfUser(userId: string): Promise<Affiliate | null> {
  if (!(await pg())) return mem.affs.find((a) => a.userId === userId) ?? null;
  const { data } = await db().from('affiliates').select('*').eq('user_id', userId).maybeSingle();
  return data ? affFrom(data as AffRow) : null;
}
export async function affiliateById(id: string): Promise<Affiliate | null> {
  if (!(await pg())) return mem.affs.find((a) => a.id === id) ?? null;
  const { data } = await db().from('affiliates').select('*').eq('id', id).maybeSingle();
  return data ? affFrom(data as AffRow) : null;
}
async function affiliateByCode(code: string): Promise<Affiliate | null> {
  if (!isCode(code)) return null;
  if (!(await pg())) return mem.affs.find((a) => a.code === code) ?? null;
  const { data } = await db().from('affiliates').select('*').eq('code', code).maybeSingle();
  return data ? affFrom(data as AffRow) : null;
}
async function patchAffiliate(id: string, patch: Record<string, unknown>, memPatch: Partial<Affiliate>) {
  if (await pg()) {
    const { error } = await db()
      .from('affiliates')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  }
  mem.affs = mem.affs.map((a) => (a.id === id ? { ...a, ...memPatch } : a));
  return true;
}

/* An existing account joins (no new account). Free during the promotion; the fee is never charged automatically. */
export async function joinProgram(userId: string, displayName: string, acceptTerms: boolean, now = Date.now()): Promise<R<Affiliate>> {
  const s = await affSettings();
  if (!s.enabled) return fail(409, 'The affiliate program is not open right now.');
  if (!acceptTerms) return fail(400, 'Please accept the affiliate terms.');
  const existing = await affiliateOfUser(userId);
  if (existing) return ok(existing);
  const name = displayName.trim().slice(0, 60);
  const a: Affiliate = {
    id: crypto.randomUUID(),
    userId,
    code: makeCode(),
    displayName: name,
    publicLeaderboard: true,
    status: 'pending',
    qualificationStartedAt: now,
    qualificationEndsAt: now + s.qualificationDays * DAY,
    verifiedAt: null,
    feeCents: joinFeeCents(s),
    feeWaived: joinFeeCents(s) === 0,
    termsVersion: s.termsVersion,
    payoutMethod: '',
    payoutDetails: '',
    createdAt: now,
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await pg()) {
      const { error } = await db()
        .from('affiliates')
        .insert({
          id: a.id,
          user_id: userId,
          code: a.code,
          display_name: a.displayName,
          status: 'pending',
          qualification_started_at: iso(now),
          qualification_ends_at: iso(a.qualificationEndsAt),
          fee_cents: a.feeCents,
          fee_waived: a.feeWaived,
          terms_version: a.termsVersion,
        });
      if (!error) break;
      if (error.code === '23505' && /user_id/.test(error.message)) return ok((await affiliateOfUser(userId))!);
      if (error.code !== '23505') return fail(500, 'Could not open your affiliate account.');
      a.code = makeCode(); // a code clash: try another
    } else {
      if (mem.affs.some((x) => x.code === a.code)) {
        a.code = makeCode();
        continue;
      }
      mem.affs.push(a);
      break;
    }
  }
  await logEvent(a.id, userId, 'joined', { fee: a.feeCents, terms: a.termsVersion });
  return ok(a);
}

export async function updateProfile(userId: string, p: { displayName?: string; publicLeaderboard?: boolean; payoutMethod?: string; payoutDetails?: string }): Promise<R<Affiliate>> {
  const a = await affiliateOfUser(userId);
  if (!a) return fail(404, 'You are not an affiliate yet.');
  const next = {
    displayName: (p.displayName ?? a.displayName).trim().slice(0, 60),
    publicLeaderboard: p.publicLeaderboard ?? a.publicLeaderboard,
    payoutMethod: (p.payoutMethod ?? a.payoutMethod).trim().slice(0, 40),
    payoutDetails: (p.payoutDetails ?? a.payoutDetails).trim().slice(0, 200),
  };
  await patchAffiliate(a.id, { display_name: next.displayName, public_leaderboard: next.publicLeaderboard, payout_method: next.payoutMethod, payout_details: next.payoutDetails }, next);
  await logEvent(a.id, userId, 'profile_updated', { leaderboard: next.publicLeaderboard, payout: next.payoutMethod });
  return ok({ ...a, ...next });
}

/* ---------- referral cookie (signed, so it cannot be edited) ---------- */
export const REF_COOKIE = 'sob_ref';
const secret = () => derivedSecret('AFFILIATE_SECRET') ?? 'sellonbay-dev-affiliate';
const sig = (body: string) => createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 32);
export const signRef = (code: string, productKey: string, issuedAt: number) => {
  const body = `${code}.${productKey || '-'}.${Math.floor(issuedAt / 1000)}`;
  return `${body}.${sig(body)}`;
};
export function readRef(value: string | undefined | null): { code: string; productKey: string; issuedAt: number } | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [code, product, at, s] = parts;
  const want = sig(`${code}.${product}.${at}`);
  if (s.length !== want.length || !timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  return isCode(code) && /^\d{6,12}$/.test(at) ? { code, productKey: product === '-' ? '' : product, issuedAt: Number(at) * 1000 } : null;
}

/* A click on a referral link: counted once per visitor, link and day; nothing about the visitor is kept but a keyed hash. */
export async function recordClick(code: string, productKey: string, visitorHash: string, now = Date.now()): Promise<R<{ cookie: string; days: number }>> {
  const s = await affSettings();
  if (!s.enabled) return fail(409, 'off');
  const a = await affiliateByCode(code);
  if (!a || !mayEarn(a.status)) return fail(404, 'unknown');
  const product = /^[a-z0-9-]{1,120}$/.test(productKey) ? productKey : '';
  const day = new Date(now).toISOString().slice(0, 10);
  if (await pg()) {
    const { count } = await db().from('affiliate_clicks').select('id', { count: 'exact', head: true }).eq('visitor_hash', visitorHash).eq('day', day);
    if ((count ?? 0) >= s.fraud.maxClicksPerVisitorPerDay) return fail(429, 'limit');
    await db().from('affiliate_clicks').insert({ affiliate_id: a.id, product_key: product, visitor_hash: visitorHash, day }); // a repeat the same day is ignored by the unique key
  } else {
    if (mem.clicks.filter((c) => c.visitorHash === visitorHash && c.day === day).length >= s.fraud.maxClicksPerVisitorPerDay) return fail(429, 'limit');
    if (!mem.clicks.some((c) => c.affiliateId === a.id && c.productKey === product && c.visitorHash === visitorHash && c.day === day))
      mem.clicks.push({ affiliateId: a.id, productKey: product, visitorHash, day, at: now });
  }
  return ok({ cookie: signRef(a.code, product, now), days: s.cookieDays });
}

/*
 * Remember what a referral led to (a sign-up, an order, a buyer subscription, a seller plan), from the signed cookie of this request. Called
 * right after the thing is created; it never blocks or changes it, and does nothing without the cookie, outside a request, or while the program
 * is off. The first affiliate wins: a thing is attributed once.
 */
export async function attributeFromRequest(kind: Attribution['kind'], refId: string, customerId: string | null, productKey = '', now = Date.now()): Promise<void> {
  try {
    const { cookies } = await import('next/headers');
    const ref = readRef((await cookies()).get(REF_COOKIE)?.value);
    if (!ref) return;
    await attribute(kind, refId, customerId, productKey, ref, now);
  } catch {
    /* outside a request, or anything unexpected: the purchase is never affected */
  }
}
export async function attribute(kind: Attribution['kind'], refId: string, customerId: string | null, productKey: string, ref: { code: string; issuedAt: number }, now = Date.now()): Promise<boolean> {
  const s = await affSettings();
  if (!s.enabled || !withinWindow(s, ref.issuedAt, now)) return false;
  const a = await affiliateByCode(ref.code);
  if (!a || !mayEarn(a.status) || isSelfReferral(s, a.userId, customerId)) return false;
  const row: Attribution = { id: crypto.randomUUID(), affiliateId: a.id, kind, refId: String(refId).slice(0, 80), customerId, productKey: productKey.slice(0, 200), createdAt: now };
  if (await pg()) {
    const { error } = await db().from('affiliate_attributions').insert({ id: row.id, affiliate_id: a.id, kind, ref_id: row.refId, customer_id: customerId, product_key: row.productKey });
    return !error;
  }
  if (mem.attrs.some((x) => x.kind === kind && x.refId === row.refId)) return false;
  mem.attrs.push(row);
  return true;
}

/* ---------- commissions and the ledger ---------- */
type CommRow = Record<string, unknown> & { id: string };
const commFrom = (r: CommRow): Commission => ({
  id: r.id,
  affiliateId: String(r.affiliate_id),
  attributionId: String(r.attribution_id),
  kind: r.kind as CommissionKind,
  sourceRef: String(r.source_ref),
  basisCents: Number(r.basis_cents),
  rateBps: Number(r.rate_bps),
  amountCents: Number(r.amount_cents),
  status: r.status as Commission['status'],
  approveAfter: ms(r.approve_after),
  approvedAt: ms(r.approved_at),
  reversedAt: ms(r.reversed_at),
  createdAt: ms(r.created_at) ?? 0,
});
const attrFrom = (r: Record<string, unknown>): Attribution => ({
  id: String(r.id),
  affiliateId: String(r.affiliate_id),
  kind: r.kind as Attribution['kind'],
  refId: String(r.ref_id),
  customerId: (r.customer_id as string | null) ?? null,
  productKey: String(r.product_key ?? ''),
  createdAt: ms(r.created_at) ?? 0,
});

export async function allAttributions(): Promise<Attribution[]> {
  if (!(await pg())) return [...mem.attrs];
  const { data } = await db().from('affiliate_attributions').select('*').order('created_at', { ascending: false }).limit(20_000);
  return ((data ?? []) as Record<string, unknown>[]).map(attrFrom);
}
export async function allCommissions(): Promise<Commission[]> {
  if (!(await pg())) return [...mem.comms];
  const { data } = await db().from('affiliate_commissions').select('*').order('created_at', { ascending: false }).limit(20_000);
  return ((data ?? []) as CommRow[]).map(commFrom);
}
async function ledgerOf(affiliateId?: string): Promise<LedgerRow[]> {
  if (!(await pg())) return mem.ledger.filter((l) => !affiliateId || l.affiliate_id === affiliateId);
  let q = db().from('affiliate_ledger').select('affiliate_id, entry_key, kind, amount_cents, commission_id, withdrawal_id, at').limit(50_000);
  if (affiliateId) q = q.eq('affiliate_id', affiliateId);
  return ((await q).data ?? []) as LedgerRow[];
}
/* One ledger entry per key: a second try with the same key does nothing (the unique key refuses it). */
async function ledgerPost(e: Omit<LedgerRow, 'at'>): Promise<boolean> {
  if (await pg()) {
    const { error } = await db().from('affiliate_ledger').insert(e);
    return !error;
  }
  if (mem.ledger.some((l) => l.entry_key === e.entry_key)) return false;
  mem.ledger.push({ ...e, at: new Date().toISOString() });
  return true;
}
async function insertCommission(c: Commission): Promise<boolean> {
  if (await pg()) {
    const { error } = await db()
      .from('affiliate_commissions')
      .insert({
        id: c.id,
        affiliate_id: c.affiliateId,
        attribution_id: c.attributionId,
        kind: c.kind,
        source_ref: c.sourceRef,
        basis_cents: c.basisCents,
        rate_bps: c.rateBps,
        amount_cents: c.amountCents,
        status: 'pending',
        approve_after: iso(c.approveAfter),
      });
    return !error; // a duplicate source_ref is refused: one commission per paid thing
  }
  if (mem.comms.some((x) => x.sourceRef === c.sourceRef)) return false;
  mem.comms.push(c);
  return true;
}
async function patchCommission(id: string, patch: Partial<Commission>) {
  if (await pg()) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status) row.status = patch.status;
    if (patch.basisCents !== undefined) row.basis_cents = patch.basisCents;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.approveAfter !== undefined) row.approve_after = iso(patch.approveAfter);
    if (patch.approvedAt !== undefined) row.approved_at = iso(patch.approvedAt);
    if (patch.reversedAt !== undefined) row.reversed_at = iso(patch.reversedAt);
    await db().from('affiliate_commissions').update(row).eq('id', id);
  } else mem.comms = mem.comms.map((c) => (c.id === id ? { ...c, ...patch } : c));
}

const PAID_STATES = ['funded', 'release_pending', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out', 'fix_requested', 'overdue', 'disputed'];
const DONE_STATES = ['accepted', 'payout_pending', 'paid_out'];

/* How many paid orders this buyer had before this one (first or repeat purchase). */
async function paidOrdersBefore(buyerId: string | null, orderId: string, createdAt: number): Promise<number> {
  if (!buyerId) return 0;
  const list = await (await orderStore()).forUser(buyerId).catch(() => []);
  return list.filter((o) => o.id !== orderId && o.createdAt < createdAt && !!o.fundedAt && o.priceCents > 0).length;
}

/* What an attributed thing is worth now: its commission kind, eligible net basis, when it may be approved, and whether it was refunded. */
async function valueOf(s: Settings, at: Attribution): Promise<{ kind: CommissionKind; sourceRef: string; basisCents: number; approveFrom: number | null; reversed: boolean; reason: string }[]> {
  if (at.kind === 'order') {
    const o = await getOrder(at.refId).catch(() => null);
    if (!o || !o.fundedAt || o.priceCents <= 0 || !productEligible(s, o.productKey ?? '')) return [];
    const reversed = o.state === 'refunded' || o.state === 'cancelled' || (o.refundedCents ?? 0) >= o.priceCents;
    const kind = purchaseKind(await paidOrdersBefore(o.buyerId ?? null, o.id, o.createdAt));
    return [
      {
        kind,
        sourceRef: `order:${o.id}`,
        basisCents: orderBasisCents({ lines: o.lines, refundedCents: o.refundedCents ?? 0 }),
        approveFrom: DONE_STATES.includes(o.state) && o.acceptedAt ? o.acceptedAt : null,
        reversed,
        reason: reversed ? 'order refunded' : '',
      },
    ];
  }
  if (at.kind === 'buyer_sub' && (await pg())) {
    const { data } = await db().from('buyer_sub_payments').select('id, kind, amount_cents, status, decided_at').eq('subscription_id', at.refId);
    return ((data ?? []) as { id: string; kind: string; amount_cents: number; status: string; decided_at: string | null }[])
      .filter((p) => p.status === 'verified')
      .map((p) => ({
        kind: p.kind === 'renewal' ? 'buyer_sub_renewal' : 'buyer_sub_new',
        sourceRef: `buyer_sub_payment:${p.id}`,
        basisCents: p.amount_cents,
        approveFrom: ms(p.decided_at),
        reversed: false,
        reason: '',
      }));
  }
  if (at.kind === 'buyer_sub') {
    // without migration 0086's database (demo): the buyer subscription payments kept in memory
    const { adminSubs } = await import('../buyerSubs/service');
    const { payments } = await adminSubs().catch(() => ({ payments: [] as { id: string; subscriptionId: string; kind: string; amountCents: number; status: string; createdAt: number }[] }));
    return payments
      .filter((p) => p.subscriptionId === at.refId && p.status === 'verified')
      .map((p) => ({
        kind: p.kind === 'renewal' ? ('buyer_sub_renewal' as const) : ('buyer_sub_new' as const),
        sourceRef: `buyer_sub_payment:${p.id}`,
        basisCents: p.amountCents,
        approveFrom: p.createdAt,
        reversed: false,
        reason: '',
      }));
  }
  if (at.kind === 'seller_sub') {
    const sub = await subscriptionById(at.refId).catch(() => null);
    if (!sub || !sub.priceCents) return [];
    const active = ['active', 'renewal_due', 'renewal_failed', 'cancelling', 'ended'].includes(sub.status) && !!sub.periodStart;
    if (!active) return [];
    return [
      {
        kind: 'seller_sub',
        sourceRef: `seller_sub:${sub.id}:${sub.periodStart}`,
        basisCents: sub.priceCents,
        approveFrom: sub.periodStart ?? null,
        reversed: false,
        reason: '',
      },
    ];
  }
  return [];
}

/*
 * The scheduled job (POST /api/cron/orders): makes commissions for attributed paid things, approves them after the hold, reverses refunded
 * ones, and qualifies affiliates who reached the target. Rates and kinds are read now and recorded on the commission: a later rate change
 * never touches a commission already made. Runs even while the program is off, so earned commissions are never lost.
 */
export async function runAffiliateJobs(now = Date.now()): Promise<{ made: number; approved: number; reversed: number; qualified: number }> {
  if (!(await pg()) && !mem.affs.length) return { made: 0, approved: 0, reversed: 0, qualified: 0 };
  const s = await affSettings();
  const [attrs, comms, affs] = await Promise.all([allAttributions(), allCommissions(), allAffiliates()]);
  const affOf = new Map(affs.map((a) => [a.id, a]));
  let made = 0,
    approved = 0,
    reversed = 0,
    qualified = 0;
  for (const at of attrs.filter((x) => x.kind !== 'signup')) {
    const a = affOf.get(at.affiliateId);
    if (!a) continue;
    for (const v of await valueOf(s, at)) {
      const existing = comms.find((c) => c.sourceRef === v.sourceRef) ?? mem.comms.find((c) => c.sourceRef === v.sourceRef);
      if (!existing) {
        if (v.reversed || !mayEarn(a.status) || !s.kindsEnabled[v.kind]) continue;
        const rate = s.rates[v.kind];
        const c: Commission = {
          id: crypto.randomUUID(),
          affiliateId: a.id,
          attributionId: at.id,
          kind: v.kind,
          sourceRef: v.sourceRef,
          basisCents: v.basisCents,
          rateBps: rate,
          amountCents: commissionCents(v.basisCents, rate),
          status: 'pending',
          approveAfter: v.approveFrom ? v.approveFrom + (s.holdDays + (now - a.createdAt < s.fraud.holdNewAffiliateDays * DAY ? s.fraud.holdNewAffiliateDays : 0)) * DAY : null,
          approvedAt: null,
          reversedAt: null,
          createdAt: now,
        };
        if (c.amountCents > 0 && (await insertCommission(c))) {
          made++;
          comms.push(c);
        }
        continue;
      }
      if (existing.status === 'reversed') continue;
      if (v.reversed) {
        // money first (one key, so a retry is harmless), then the status: a failure between the two is repaired on the next run
        if (existing.status === 'approved')
          await ledgerPost({
            affiliate_id: a.id,
            entry_key: `reversal:${existing.id}`,
            kind: 'reversal',
            amount_cents: -existing.amountCents,
            commission_id: existing.id,
            withdrawal_id: null,
          });
        await patchCommission(existing.id, { status: 'reversed', reversedAt: now });
        await logEvent(a.id, null, 'commission_reversed', { commission: existing.id, reason: v.reason });
        reversed++;
        continue;
      }
      if (existing.status === 'pending') {
        // the basis follows partial refunds until approval; the rate stays the one recorded
        const amount = commissionCents(v.basisCents, existing.rateBps);
        const approveAfter = existing.approveAfter ?? (v.approveFrom ? v.approveFrom + s.holdDays * DAY : null);
        if (amount !== existing.amountCents || approveAfter !== existing.approveAfter) await patchCommission(existing.id, { basisCents: v.basisCents, amountCents: amount, approveAfter });
        if (approveAfter && approveAfter <= now && amount > 0 && mayEarn(a.status)) {
          // money first (one key per commission, so a retry never pays twice), then the status
          await ledgerPost({ affiliate_id: a.id, entry_key: `commission:${existing.id}`, kind: 'commission', amount_cents: amount, commission_id: existing.id, withdrawal_id: null });
          await patchCommission(existing.id, { status: 'approved', approvedAt: now, amountCents: amount });
          if (s.notify.commissionApproved) await notify(a.userId, 'aff_commission', { amount: `$${(amount / 100).toFixed(2)}` }, { dedupe: `aff-comm:${existing.id}` });
          approved++;
        }
      }
    }
  }
  // qualification: verified (approved, non-reversed) sales inside the window
  const fresh = await allCommissions();
  for (const a of affs.filter((x) => x.status === 'pending')) {
    const sales = fresh.filter((c) => c.affiliateId === a.id && c.status === 'approved' && c.createdAt <= a.qualificationEndsAt).length;
    if (qualifies(s, a, sales, now)) {
      await patchAffiliate(
        a.id,
        { status: 'qualified', verified_at: iso(now), fee_waived: s.waiveFeeOnQualify ? true : a.feeWaived },
        { status: 'qualified', verifiedAt: now, feeWaived: s.waiveFeeOnQualify || a.feeWaived },
      );
      await logEvent(a.id, null, 'qualified', { sales });
      if (s.notify.qualified) await notify(a.userId, 'aff_qualified', {}, { dedupe: `aff-q:${a.id}` });
      qualified++;
    }
  }
  return { made, approved, reversed, qualified };
}

/* ---------- withdrawals ---------- */
type WdRow = Record<string, unknown> & { id: string };
const wdFrom = (r: WdRow): Withdrawal => ({
  id: r.id,
  affiliateId: String(r.affiliate_id),
  amountCents: Number(r.amount_cents),
  status: r.status as Withdrawal['status'],
  method: String(r.method ?? ''),
  detailsMasked: String(r.details_masked ?? ''),
  payoutReference: String(r.payout_reference ?? ''),
  createdAt: ms(r.created_at) ?? 0,
  decidedAt: ms(r.decided_at),
  paidAt: ms(r.paid_at),
});
export async function allWithdrawals(affiliateId?: string): Promise<Withdrawal[]> {
  if (!(await pg())) return mem.wds.filter((w) => !affiliateId || w.affiliateId === affiliateId);
  let q = db().from('affiliate_withdrawals').select('*').order('created_at', { ascending: false }).limit(5000);
  if (affiliateId) q = q.eq('affiliate_id', affiliateId);
  return (((await q).data ?? []) as WdRow[]).map(wdFrom);
}
async function balanceOf(affiliateId: string) {
  const [ledger, wds] = await Promise.all([ledgerOf(affiliateId), allWithdrawals(affiliateId)]);
  const open = wds.filter((w) => w.status === 'requested' || w.status === 'approved').reduce((s, w) => s + w.amountCents, 0);
  return { ...balances(ledger, open), openCents: open };
}

/* An affiliate asks to be paid. Allowed while the program is off too: earned money stays theirs. */
export async function requestWithdrawal(userId: string, amountCents: number): Promise<R<Withdrawal>> {
  const a = await affiliateOfUser(userId);
  if (!a) return fail(404, 'You are not an affiliate.');
  if (a.status === 'rejected') return fail(409, 'This affiliate account is closed. Contact support about your balance.');
  if (!a.payoutMethod || !a.payoutDetails) return fail(400, 'Add your payout method first.');
  const s = await affSettings();
  const bal = await balanceOf(a.id);
  if (bal.openCents > 0) return fail(409, 'You already have a withdrawal waiting.');
  const err = checkWithdrawal(s, amountCents, bal.availableCents);
  if (err) return fail(400, err);
  const w: Withdrawal = {
    id: crypto.randomUUID(),
    affiliateId: a.id,
    amountCents,
    status: 'requested',
    method: a.payoutMethod,
    detailsMasked: maskDetails(a.payoutDetails),
    payoutReference: '',
    createdAt: Date.now(),
    decidedAt: null,
    paidAt: null,
  };
  if (await pg()) {
    const { error } = await db().from('affiliate_withdrawals').insert({ id: w.id, affiliate_id: a.id, amount_cents: amountCents, method: w.method, details_masked: w.detailsMasked });
    if (error) return fail(error.code === '23505' ? 409 : 500, error.code === '23505' ? 'You already have a withdrawal waiting.' : 'Could not save the request.');
  } else mem.wds.push(w);
  await logEvent(a.id, userId, 'withdrawal_requested', { amount: amountCents });
  return ok(w);
}

/* An admin approves, rejects or records the payment of a withdrawal. Paid needs a reference and books the money out once (one ledger key). */
export async function decideWithdrawal(adminId: string | null, id: string, action: 'approve' | 'reject' | 'paid', reference: string): Promise<R<Withdrawal>> {
  const w = (await allWithdrawals()).find((x) => x.id === id);
  if (!w) return fail(404, 'No such withdrawal.');
  const a = await affiliateById(w.affiliateId);
  if (!a) return fail(404, 'No such affiliate.');
  const now = Date.now();
  let next: Withdrawal;
  if (action === 'approve') {
    if (w.status !== 'requested') return fail(409, 'Only a new request can be approved.');
    next = { ...w, status: 'approved', decidedAt: now };
  } else if (action === 'reject') {
    if (w.status !== 'requested' && w.status !== 'approved') return fail(409, 'This withdrawal is already closed.');
    next = { ...w, status: 'rejected', decidedAt: now };
  } else {
    if (w.status !== 'approved') return fail(409, 'Approve the withdrawal first.');
    const ref = reference.trim().slice(0, 120);
    if (ref.length < 3) return fail(400, 'Enter the payout reference.');
    const key = `withdrawal:${w.id}`;
    const booked = (await ledgerOf(a.id)).some((l) => l.entry_key === key); // an earlier try booked the money but did not save the status: finish it, never book twice
    if (!booked) {
      const bal = await balanceOf(a.id);
      if (bal.availableCents + bal.openCents < w.amountCents) return fail(409, 'The balance no longer covers this withdrawal (a commission was reversed).');
      const posted = await ledgerPost({ affiliate_id: a.id, entry_key: key, kind: 'withdrawal', amount_cents: -w.amountCents, commission_id: null, withdrawal_id: w.id });
      if (!posted && !(await ledgerOf(a.id)).some((l) => l.entry_key === key)) return fail(500, 'Could not record the payout. Nothing was booked; please try again.');
    }
    next = { ...w, status: 'paid', paidAt: now, payoutReference: ref };
  }
  if (await pg())
    await db()
      .from('affiliate_withdrawals')
      .update({ status: next.status, decided_by: adminId, decided_at: iso(next.decidedAt ?? now), paid_at: iso(next.paidAt), payout_reference: next.payoutReference })
      .eq('id', id)
      .eq('status', w.status); // only from the state it was read in: two admins at once cannot both decide
  else mem.wds = mem.wds.map((x) => (x.id === id ? next : x));
  await audit(adminId, `affiliate_withdrawal_${next.status}`, 'affiliate_withdrawal', id, { amount: w.amountCents, reference: next.payoutReference });
  await logEvent(a.id, adminId, `withdrawal_${next.status}`, { amount: w.amountCents });
  const s = await affSettings();
  if (s.notify.withdrawalDecided)
    await notify(a.userId, 'aff_withdrawal', {
      amount: `$${(w.amountCents / 100).toFixed(2)}`,
      status: next.status,
      note: next.status === 'paid' ? `Payment reference: ${next.payoutReference}.` : '',
    });
  return ok(next);
}

/* ---------- admin: affiliates ---------- */
export async function adminMoveAffiliate(adminId: string | null, id: string, to: AffStatus, reason: string): Promise<R<Affiliate>> {
  const a = await affiliateById(id);
  if (!a) return fail(404, 'No such affiliate.');
  if (!ADMIN_MOVES[a.status].includes(to)) return fail(409, `An affiliate who is ${a.status} cannot become ${to}.`);
  const now = Date.now();
  const patch: Partial<Affiliate> = { status: to, ...(to === 'qualified' && !a.verifiedAt ? { verifiedAt: now } : {}) };
  await patchAffiliate(id, { status: to, ...(patch.verifiedAt ? { verified_at: iso(now) } : {}) }, patch);
  await audit(adminId, `affiliate_${to}`, 'affiliate', a.code, { from: a.status, reason: reason.slice(0, 300) });
  await logEvent(id, adminId, `status_${to}`, { from: a.status, reason: reason.slice(0, 300) });
  return ok({ ...a, ...patch });
}
/* Extend the qualification window by some days, or restart it from today. The fee is never charged here. */
export async function adminQualification(adminId: string | null, id: string, action: 'extend' | 'restart', days: number): Promise<R<Affiliate>> {
  const a = await affiliateById(id);
  if (!a) return fail(404, 'No such affiliate.');
  if (a.status !== 'pending') return fail(409, 'Only a pending affiliate has a qualification window.');
  const s = await affSettings();
  const now = Date.now();
  const n = Number.isInteger(days) && days > 0 && days <= 3650 ? days : s.qualificationDays;
  const patch = action === 'extend' ? { qualificationEndsAt: Math.max(now, a.qualificationEndsAt) + n * DAY } : { qualificationStartedAt: now, qualificationEndsAt: now + n * DAY };
  await patchAffiliate(
    id,
    { qualification_ends_at: iso(patch.qualificationEndsAt), ...('qualificationStartedAt' in patch ? { qualification_started_at: iso(patch.qualificationStartedAt) } : {}) },
    patch,
  );
  await audit(adminId, `affiliate_qualification_${action}`, 'affiliate', a.code, { days: n });
  await logEvent(id, adminId, `qualification_${action}`, { days: n });
  return ok({ ...a, ...patch });
}
/* An admin reverses one commission by hand (fraud found), once. */
export async function adminReverseCommission(adminId: string | null, id: string, reason: string): Promise<R<true>> {
  const c = (await allCommissions()).find((x) => x.id === id);
  if (!c) return fail(404, 'No such commission.');
  if (c.status === 'reversed') return fail(409, 'Already reversed.');
  await patchCommission(id, { status: 'reversed', reversedAt: Date.now() });
  if (c.status === 'approved')
    await ledgerPost({ affiliate_id: c.affiliateId, entry_key: `reversal:${c.id}`, kind: 'reversal', amount_cents: -c.amountCents, commission_id: c.id, withdrawal_id: null });
  await audit(adminId, 'affiliate_commission_reversed', 'affiliate_commission', id, { amount: c.amountCents, reason: reason.slice(0, 300) });
  await logEvent(c.affiliateId, adminId, 'commission_reversed', { commission: id, reason: reason.slice(0, 300) });
  return ok(true);
}

/* ---------- reports ---------- */
export async function clicksOf(affiliateId?: string): Promise<{ affiliateId: string; productKey: string; at: number }[]> {
  if (!(await pg())) return mem.clicks.filter((c) => !affiliateId || c.affiliateId === affiliateId);
  let q = db().from('affiliate_clicks').select('affiliate_id, product_key, created_at').limit(50_000);
  if (affiliateId) q = q.eq('affiliate_id', affiliateId);
  return (((await q).data ?? []) as { affiliate_id: string; product_key: string; created_at: string }[]).map((c) => ({
    affiliateId: c.affiliate_id,
    productKey: c.product_key,
    at: Date.parse(c.created_at),
  }));
}

const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);
/* The month's leaderboard from verified (approved) commissions made that month; the public one shows only affiliates who allow it. */
export async function leaderboard(month = monthOf(Date.now()), publicOnly = false): Promise<(LeaderRow & { rank: number })[]> {
  const [comms, affs] = await Promise.all([allCommissions(), allAffiliates()]);
  const rows: LeaderRow[] = affs
    .filter((a) => mayEarn(a.status) && (!publicOnly || a.publicLeaderboard))
    .map((a) => {
      const mine = comms.filter((c) => c.affiliateId === a.id && c.status === 'approved' && monthOf(c.approvedAt ?? c.createdAt) === month);
      return {
        affiliateId: a.id,
        name: a.displayName || `Affiliate ${a.code.slice(-4)}`,
        sales: mine.length,
        netCents: mine.reduce((s, c) => s + c.basisCents, 0),
        qualified: a.status === 'qualified',
        public: a.publicLeaderboard,
      };
    });
  return rankLeaders(rows).map((r, i) => ({ ...r, rank: i + 1 }));
}
/* Months this affiliate topped the leaderboard (for the Monthly Champion badge), counted from the months before this one. */
async function championMonths(affiliateId: string, comms: Commission[]): Promise<number> {
  const months = [...new Set(comms.filter((c) => c.status === 'approved').map((c) => monthOf(c.approvedAt ?? c.createdAt)))].filter((m) => m < monthOf(Date.now()));
  let n = 0;
  for (const m of months) if ((await leaderboard(m))[0]?.affiliateId === affiliateId) n++;
  return n;
}

export async function dashboardOf(userId: string) {
  const a = await affiliateOfUser(userId);
  if (!a) return null;
  const s = await affSettings();
  const [clicks, attrs, comms, wds, bal, board] = await Promise.all([
    clicksOf(a.id),
    allAttributions().then((x) => x.filter((y) => y.affiliateId === a.id)),
    allCommissions().then((x) => x.filter((y) => y.affiliateId === a.id)),
    allWithdrawals(a.id),
    balanceOf(a.id),
    leaderboard(),
  ]);
  const verified = comms.filter((c) => c.status === 'approved');
  const inWindow = verified.filter((c) => c.createdAt <= a.qualificationEndsAt).length;
  const champ = await championMonths(a.id, comms);
  return {
    affiliate: { ...a, payoutDetails: a.payoutDetails ? maskDetails(a.payoutDetails) : '' },
    settings: s,
    clicks: clicks.length,
    signups: attrs.filter((x) => x.kind === 'signup').length,
    attributed: attrs.filter((x) => x.kind !== 'signup').length,
    verifiedSales: verified.length,
    qualificationSales: inWindow,
    pendingCents: comms.filter((c) => c.status === 'pending').reduce((x, c) => x + c.amountCents, 0),
    approvedCents: bal.earnedCents - bal.reversedCents,
    totalEarnedCents: bal.earnedCents,
    paidCents: bal.paidCents,
    availableCents: bal.availableCents,
    openWithdrawalCents: bal.openCents,
    commissions: comms.slice(0, 50),
    withdrawals: wds,
    badges: earnedBadges(s, a, verified.length, champ),
    rank: board.find((r) => r.affiliateId === a.id)?.rank ?? null,
    activity: [
      ...attrs.map((x) => ({ at: x.createdAt, text: x.kind === 'signup' ? 'A visitor you referred made an account' : 'A referred purchase was recorded' })),
      ...comms.map((c) => ({
        at: c.approvedAt ?? c.createdAt,
        text: `Commission ${c.status}: $${(c.amountCents / 100).toFixed(2)}`,
      })),
    ]
      .sort((x, y) => y.at - x.at)
      .slice(0, 20),
  };
}

export async function overview(now = Date.now()) {
  const [affs, comms, clicks, attrs, wds] = await Promise.all([allAffiliates(), allCommissions(), clicksOf(), allAttributions(), allWithdrawals()]);
  const monthComms = comms.filter((c) => monthOf(c.createdAt) === monthOf(now));
  return {
    affiliates: affs.length,
    pending: affs.filter((a) => a.status === 'pending').length,
    qualified: affs.filter((a) => a.status === 'qualified').length,
    suspended: affs.filter((a) => a.status === 'suspended').length,
    clicks: clicks.length,
    attributions: attrs.length,
    signups: attrs.filter((a) => a.kind === 'signup').length,
    commissionsPendingCents: comms.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amountCents, 0),
    commissionsApprovedCents: comms.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amountCents, 0),
    reversed: comms.filter((c) => c.status === 'reversed').length,
    monthSales: monthComms.filter((c) => c.status !== 'reversed').length,
    withdrawalsWaiting: wds.filter((w) => w.status === 'requested' || w.status === 'approved').length,
    conversion: clicks.length ? Math.round((attrs.filter((a) => a.kind !== 'signup').length / clicks.length) * 1000) / 10 : 0,
  };
}

/* Simple fraud signals for the admin: many clicks with no sale, commissions reversed, a burst of sign-ups. Nothing is done automatically. */
export async function fraudSignals() {
  const [affs, comms, clicks, attrs] = await Promise.all([allAffiliates(), allCommissions(), clicksOf(), allAttributions()]);
  return affs
    .map((a) => {
      const c = clicks.filter((x) => x.affiliateId === a.id).length;
      const sales = comms.filter((x) => x.affiliateId === a.id && x.status !== 'reversed').length;
      const rev = comms.filter((x) => x.affiliateId === a.id && x.status === 'reversed').length;
      const signups = attrs.filter((x) => x.affiliateId === a.id && x.kind === 'signup').length;
      const flags = [
        c >= 200 && sales === 0 ? 'many clicks, no sale' : '',
        rev >= 2 && rev >= sales / 2 ? 'many reversed commissions' : '',
        signups >= 20 && sales === 0 ? 'many sign-ups, no sale' : '',
      ].filter(Boolean);
      return { affiliate: a, clicks: c, sales, reversed: rev, signups, flags };
    })
    .filter((x) => x.flags.length);
}

/* The CSV an admin downloads: one row per affiliate (no customer data). */
export async function exportCsv(): Promise<string> {
  const [affs, comms, clicks, attrs] = await Promise.all([allAffiliates(), allCommissions(), clicksOf(), allAttributions()]);
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['code', 'display_name', 'status', 'joined', 'clicks', 'referrals', 'verified_sales', 'pending_usd', 'approved_usd', 'reversed'];
  const rows = affs.map((a) => {
    const mine = comms.filter((c) => c.affiliateId === a.id);
    return [
      a.code,
      a.displayName,
      a.status,
      new Date(a.createdAt).toISOString().slice(0, 10),
      clicks.filter((c) => c.affiliateId === a.id).length,
      attrs.filter((x) => x.affiliateId === a.id && x.kind !== 'signup').length,
      mine.filter((c) => c.status === 'approved').length,
      (mine.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amountCents, 0) / 100).toFixed(2),
      (mine.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amountCents, 0) / 100).toFixed(2),
      mine.filter((c) => c.status === 'reversed').length,
    ]
      .map(esc)
      .join(',');
  });
  return [head.join(','), ...rows].join('\n');
}

export { DEFAULTS as AFF_DEFAULTS };
