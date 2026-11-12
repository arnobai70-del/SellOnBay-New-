import 'server-only';
import { audit } from '../admin/audit';
import { productRecord } from '../catalog';
import { notify } from '../notify';
import { insertBetaOrder, move } from '../orders/service';
import { orderStore } from '../orders/store';
import { savedCoupons } from '../site/contentStore';
import { createAdminClient } from '../supabase/server';
import {
  ADMIN_MOVES,
  activation,
  checkExtendDays,
  checkPlan,
  checkReference,
  creditsLeft,
  DAY,
  dueForReminder,
  eligible,
  isLive,
  priceWithCoupon,
  renewedUntil,
  shownPlans,
  snapshotOf,
  subscribable,
  type Plan,
  type Selection,
  type SubPayment,
  type SubStatus,
  type Subscription,
} from './rules';

/*
 * Buyer subscriptions (owner, 2026-11-12), server side. Tables from migration 0085 (server only); before it is applied, or without a database,
 * everything runs in memory with the three starting plans, so the pages work in the demo. Every change by an admin is in the audit log and in
 * the subscription's own append-only history (buyer_sub_events).
 */
type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const ok = <T>(value: T) => ({ ok: true as const, value });
const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null);

const SEED: Omit<Plan, 'id'>[] = [
  ['pro', 'Pro', 14900, 7900, 3, '', '#5FA88F', 1],
  ['pro-plus', 'Pro Plus', 24900, 12900, 5, 'Popular', '#2B3DFF', 2],
  ['pro-max', 'Pro Max', 34900, 17900, 7, 'Best value', '#E0B44B', 3],
].map(([key, name, priceCents, renewalCents, websiteLimit, badge, color, sort]) => ({
  key: key as string,
  name: name as string,
  description: `${websiteLimit === 3 ? 'Three' : websiteLimit === 5 ? 'Five' : 'Seven'} websites of your choice with full source code, a 12-month licence and a year of support.`,
  badge: badge as string,
  color: color as string,
  sort: sort as number,
  priceCents: priceCents as number,
  renewalCents: renewalCents as number,
  period: 'year',
  periodDays: 365,
  websiteLimit: websiteLimit as number,
  supportDays: 365,
  benefits: [
    { text: 'Full source code', on: true },
    { text: '12-month usage licence', on: true },
    { text: 'One year of bug fixes and support', on: true },
  ],
  features: { source_code: true, support: true, bug_fixes: true },
  eligibility: { mode: 'list', categories: [], include: [], exclude: [] }, // nothing eligible until an admin adds verified listings (owner, 2026-11-12)
  licenceVersion: 'sub-2026-11',
  refundPolicy: '',
  active: true,
  visible: true,
  archivedAt: null,
}));

type Mem = { plans: Map<string, Plan>; subs: Map<string, Subscription>; sels: Selection[]; pays: SubPayment[]; settings: SubSettings };
const g = globalThis as { __buyerSubs?: Mem; __buyerSubsPg?: { ok: boolean; at: number } };
const mem: Mem = (g.__buyerSubs ??= {
  plans: new Map(SEED.map((p, i) => [`00000000-0000-4000-8000-00000000000${i + 1}`, { ...p, id: `00000000-0000-4000-8000-00000000000${i + 1}` }])),
  subs: new Map(),
  sels: [],
  pays: [],
  settings: { enabled: false, intro: '', faq: [], allowedMethods: [] },
});

async function pg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  const c = g.__buyerSubsPg;
  if (c && (c.ok || Date.now() - c.at < 30_000)) return c.ok;
  const { error } = await createAdminClient().from('buyer_sub_plans').select('id').limit(1);
  g.__buyerSubsPg = { ok: !error, at: Date.now() };
  return !error;
}

/* ---------- settings: the whole feature on or off, and the pricing page's intro and questions (app_settings, no migration) ---------- */
export type SubSettings = { enabled: boolean; intro: string; faq: { q: string; a: string }[]; allowedMethods: string[] };
const SETTINGS_KEY = 'buyer_subs:settings';
export async function subSettings(): Promise<SubSettings> {
  if (!(await pg())) return mem.settings;
  const { data } = await createAdminClient().from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
  const v = (data?.value ?? {}) as Partial<SubSettings>;
  return {
    enabled: v.enabled === true,
    intro: typeof v.intro === 'string' ? v.intro.slice(0, 600) : '',
    faq: Array.isArray(v.faq) ? v.faq.filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string').slice(0, 20) : [],
    allowedMethods: Array.isArray(v.allowedMethods) ? v.allowedMethods.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
  };
}
export async function saveSubSettings(adminId: string | null, raw: Partial<SubSettings>): Promise<R<SubSettings>> {
  const faq = Array.isArray(raw.faq)
    ? raw.faq
        .map((x) => ({
          q: String(x?.q ?? '')
            .trim()
            .slice(0, 200),
          a: String(x?.a ?? '')
            .trim()
            .slice(0, 1200),
        }))
        .filter((x) => x.q && x.a)
        .slice(0, 20)
    : [];
  const next: SubSettings = {
    enabled: raw.enabled === true,
    intro: String(raw.intro ?? '')
      .trim()
      .slice(0, 600),
    faq,
    // The payment methods subscriptions accept (ids from Finance › Payment methods); empty = every active method.
    allowedMethods: Array.isArray(raw.allowedMethods) ? raw.allowedMethods.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,64}$/.test(x)).slice(0, 20) : [],
  };
  if (await pg()) {
    const { error } = await createAdminClient().from('app_settings').upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return fail(500, 'Could not save the settings.');
  } else mem.settings = next;
  await audit(adminId, next.enabled ? 'buyer_subs_on' : 'buyer_subs_off', 'buyer_subs', 'settings', { faq: faq.length });
  return ok(next);
}

/* ---------- plans ---------- */
type PlanRow = Record<string, unknown> & { id: string };
const planFrom = (r: PlanRow): Plan => ({
  id: r.id,
  key: String(r.key),
  name: String(r.name),
  description: String(r.description ?? ''),
  badge: String(r.badge ?? ''),
  color: String(r.color ?? '#5FA88F'),
  sort: Number(r.sort ?? 0),
  priceCents: Number(r.price_cents),
  renewalCents: Number(r.renewal_cents),
  period: r.period as Plan['period'],
  periodDays: Number(r.period_days),
  websiteLimit: Number(r.template_limit),
  supportDays: Number(r.support_days),
  benefits: (r.benefits as Plan['benefits']) ?? [],
  features: (r.features as Plan['features']) ?? {},
  eligibility: (r.eligibility as Plan['eligibility']) ?? { mode: 'all', categories: [], include: [], exclude: [] },
  licenceVersion: String(r.licence_version ?? ''),
  refundPolicy: String(r.refund_policy ?? ''),
  active: !!r.active,
  visible: !!r.visible,
  archivedAt: ms(r.archived_at as string | null),
});
const planTo = (p: Omit<Plan, 'id' | 'archivedAt'>) => ({
  key: p.key,
  name: p.name,
  description: p.description,
  badge: p.badge,
  color: p.color,
  sort: p.sort,
  price_cents: p.priceCents,
  renewal_cents: p.renewalCents,
  period: p.period,
  period_days: p.periodDays,
  template_limit: p.websiteLimit,
  support_days: p.supportDays,
  benefits: p.benefits,
  features: p.features,
  eligibility: p.eligibility,
  licence_version: p.licenceVersion,
  refund_policy: p.refundPolicy,
  active: p.active,
  visible: p.visible,
  updated_at: new Date().toISOString(),
});

export async function allPlans(): Promise<Plan[]> {
  if (!(await pg())) return [...mem.plans.values()].sort((a, b) => a.sort - b.sort);
  const { data } = await createAdminClient().from('buyer_sub_plans').select('*').order('sort');
  return ((data ?? []) as PlanRow[]).map(planFrom);
}
export const publicPlans = async () => shownPlans(await allPlans());
export const planById = async (id: string) => (await allPlans()).find((p) => p.id === id) ?? null;

async function logEvent(e: { subscriptionId?: string | null; planId?: string | null; actorId: string | null; event: string; meta?: Record<string, unknown> }) {
  if (!(await pg())) return;
  await createAdminClient()
    .from('buyer_sub_events')
    .insert({ subscription_id: e.subscriptionId ?? null, plan_id: e.planId ?? null, actor_id: e.actorId, event: e.event, meta: e.meta ?? {} });
}

/* Create (id null) or edit a plan. A running subscription keeps what it bought (its snapshot); edits change new sign-ups only. */
export async function savePlan(adminId: string | null, id: string | null, raw: Record<string, unknown>): Promise<R<Plan>> {
  const c = checkPlan(raw);
  if (!c.ok) return fail(400, c.error);
  const clash = (await allPlans()).find((p) => p.key === c.value.key && p.id !== id);
  if (clash) return fail(409, 'Another plan already uses this key.');
  let saved: Plan;
  if (await pg()) {
    const db = createAdminClient();
    const q = id ? db.from('buyer_sub_plans').update(planTo(c.value)).eq('id', id) : db.from('buyer_sub_plans').insert(planTo(c.value));
    const { data, error } = await q.select('*').single();
    if (error || !data) return fail(500, 'Could not save the plan.');
    saved = planFrom(data as PlanRow);
  } else {
    const pid = id ?? crypto.randomUUID();
    if (id && !mem.plans.has(id)) return fail(404, 'No such plan.');
    saved = { ...c.value, id: pid, archivedAt: id ? (mem.plans.get(id)?.archivedAt ?? null) : null };
    mem.plans.set(pid, saved);
  }
  await audit(adminId, id ? 'buyer_plan_edited' : 'buyer_plan_created', 'buyer_plan', saved.key, { price: saved.priceCents, renewal: saved.renewalCents, limit: saved.websiteLimit });
  await logEvent({ planId: saved.id, actorId: adminId, event: id ? 'plan_edited' : 'plan_created' });
  return ok(saved);
}

export async function duplicatePlan(adminId: string | null, id: string): Promise<R<Plan>> {
  const p = await planById(id);
  if (!p) return fail(404, 'No such plan.');
  const plans = await allPlans();
  let n = 2;
  while (plans.some((x) => x.key === `${p.key}-${n}`)) n++;
  return savePlan(adminId, null, { ...p, key: `${p.key}-${n}`.slice(0, 40), name: `${p.name} (copy)`.slice(0, 60), active: false, visible: false });
}

/* Delete = archive: hidden and not buyable; subscriptions that point to it keep working. */
export async function archivePlan(adminId: string | null, id: string, archived: boolean): Promise<R<true>> {
  const p = await planById(id);
  if (!p) return fail(404, 'No such plan.');
  const at = archived ? new Date().toISOString() : null;
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('buyer_sub_plans')
      .update({ archived_at: at, active: archived ? false : p.active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return fail(500, 'Could not change the plan.');
  } else mem.plans.set(id, { ...p, archivedAt: archived ? Date.now() : null, active: archived ? false : p.active });
  await audit(adminId, archived ? 'buyer_plan_archived' : 'buyer_plan_restored', 'buyer_plan', p.key);
  await logEvent({ planId: id, actorId: adminId, event: archived ? 'plan_archived' : 'plan_restored' });
  return ok(true);
}

/* ---------- subscriptions ---------- */
type SubRow = Record<string, unknown> & { id: string };
const subFrom = (r: SubRow): Subscription => ({
  id: r.id,
  buyerId: String(r.buyer_id),
  planId: String(r.plan_id),
  plan: r.plan_snapshot as Subscription['plan'],
  status: r.status as SubStatus,
  creditsTotal: Number(r.credits_total),
  creditsUsed: Number(r.credits_used),
  amountCents: Number(r.amount_cents),
  couponCode: (r.coupon_code as string | null) ?? null,
  startsAt: ms(r.starts_at as string | null),
  expiresAt: ms(r.expires_at as string | null),
  remindedAt: ms(r.reminded_at as string | null),
  createdAt: ms(r.created_at as string) ?? 0,
});
const selFrom = (r: Record<string, unknown>): Selection => ({
  id: String(r.id),
  subscriptionId: String(r.subscription_id),
  productId: String(r.product_id),
  productKey: String(r.product_key),
  orderId: (r.order_id as string | null) ?? null,
  licenceExpiresAt: ms(r.licence_expires_at as string) ?? 0,
  supportUntil: ms(r.support_until as string) ?? 0,
  createdAt: ms(r.created_at as string) ?? 0,
});
const payFrom = (r: Record<string, unknown>): SubPayment => ({
  id: String(r.id),
  subscriptionId: String(r.subscription_id),
  kind: r.kind as SubPayment['kind'],
  amountCents: Number(r.amount_cents),
  methodLabel: String(r.method_label ?? ''),
  reference: String(r.reference),
  paidOn: (r.paid_on as string | null) ?? null,
  status: r.status as SubPayment['status'],
  createdAt: ms(r.created_at as string) ?? 0,
  refundedAt: ms((r.refunded_at as string | null) ?? null),
  refundReason: String(r.refund_reason ?? ''),
});

export async function subById(id: string): Promise<Subscription | null> {
  if (!(await pg())) return mem.subs.get(id) ?? null;
  const { data } = await createAdminClient().from('buyer_subscriptions').select('*').eq('id', id).maybeSingle();
  return data ? subFrom(data as SubRow) : null;
}
async function updateSub(id: string, patch: Partial<Subscription>): Promise<boolean> {
  if (!(await pg())) {
    const s = mem.subs.get(id);
    if (!s) return false;
    mem.subs.set(id, { ...s, ...patch });
    return true;
  }
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.creditsTotal !== undefined) row.credits_total = patch.creditsTotal;
  if (patch.startsAt !== undefined) row.starts_at = iso(patch.startsAt);
  if (patch.expiresAt !== undefined) row.expires_at = iso(patch.expiresAt);
  if (patch.remindedAt !== undefined) row.reminded_at = iso(patch.remindedAt);
  const { error } = await createAdminClient().from('buyer_subscriptions').update(row).eq('id', id);
  return !error;
}

export async function subsOf(buyerId: string): Promise<{ sub: Subscription; selections: Selection[]; payments: SubPayment[] }[]> {
  let subs: Subscription[];
  let sels: Selection[];
  let pays: SubPayment[];
  if (!(await pg())) {
    subs = [...mem.subs.values()].filter((s) => s.buyerId === buyerId);
    sels = mem.sels.filter((x) => subs.some((s) => s.id === x.subscriptionId));
    pays = mem.pays.filter((x) => subs.some((s) => s.id === x.subscriptionId));
  } else {
    const db = createAdminClient();
    subs = (((await db.from('buyer_subscriptions').select('*').eq('buyer_id', buyerId).order('created_at', { ascending: false })).data ?? []) as SubRow[]).map(subFrom);
    const ids = subs.map((s) => s.id);
    sels = ids.length ? (((await db.from('buyer_sub_selections').select('*').in('subscription_id', ids)).data ?? []) as Record<string, unknown>[]).map(selFrom) : [];
    pays = ids.length
      ? (((await db.from('buyer_sub_payments').select('*').in('subscription_id', ids).order('created_at', { ascending: false })).data ?? []) as Record<string, unknown>[]).map(payFrom)
      : [];
  }
  return subs.sort((a, b) => b.createdAt - a.createdAt).map((sub) => ({ sub, selections: sels.filter((x) => x.subscriptionId === sub.id), payments: pays.filter((x) => x.subscriptionId === sub.id) }));
}

/* A buyer starts a subscription: it waits for their payment (manual-first). One open subscription per plan at a time. */
export async function subscribe(buyerId: string, planId: string, couponCode: string | null, now = Date.now()): Promise<R<Subscription>> {
  if (!(await subSettings()).enabled) return fail(409, 'Subscriptions are not open yet.');
  const plan = (await publicPlans()).find((p) => p.id === planId);
  if (!plan) return fail(404, 'This plan is not available.');
  const open = (await subsOf(buyerId)).find(({ sub }) => sub.planId === planId && ['pending_payment', 'payment_review'].includes(sub.status));
  if (open) return ok(open.sub);
  const price = priceWithCoupon(plan.priceCents, couponCode, await savedCoupons(), new Date(now).toISOString().slice(0, 10));
  if (price.error) return fail(400, price.error);
  const sub: Subscription = {
    id: crypto.randomUUID(),
    buyerId,
    planId,
    plan: snapshotOf(plan),
    status: 'pending_payment',
    creditsTotal: 0,
    creditsUsed: 0,
    amountCents: price.cents,
    couponCode: price.coupon?.code ?? null,
    startsAt: null,
    expiresAt: null,
    remindedAt: null,
    createdAt: now,
  };
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('buyer_subscriptions')
      .insert({ id: sub.id, buyer_id: buyerId, plan_id: planId, plan_snapshot: sub.plan, status: sub.status, amount_cents: sub.amountCents, coupon_code: sub.couponCode });
    if (error) {
      console.error(JSON.stringify({ event: 'buyer_sub_save_failed', code: error.code, message: error.message }));
      return fail(500, 'Could not start the subscription. Please try again.');
    }
  } else mem.subs.set(sub.id, sub);
  await logEvent({ subscriptionId: sub.id, planId, actorId: buyerId, event: 'subscribed', meta: { amount: sub.amountCents, coupon: sub.couponCode } });
  await import('../affiliates/service').then((m) => m.attributeFromRequest('buyer_sub', sub.id, buyerId)).catch(() => {}); // an affiliate referral (lib/affiliates)
  return ok(sub);
}

/* The buyer reports a manual payment (new subscription or renewal); an admin verifies it. */
export async function submitPayment(buyerId: string, subId: string, input: { kind: 'new' | 'renewal'; methodLabel: string; reference: unknown; paidOn: string | null }): Promise<R<SubPayment>> {
  const sub = await subById(subId);
  if (!sub || sub.buyerId !== buyerId) return fail(404, 'No such subscription.');
  const reference = checkReference(input.reference);
  if (!reference) return fail(400, 'Enter the payment reference (3 to 80 letters or numbers).');
  if (input.kind === 'new' && sub.status !== 'pending_payment') return fail(409, 'This subscription is not waiting for a payment.');
  if (input.kind === 'renewal' && !['active', 'expired'].includes(sub.status)) return fail(409, 'Only an active or ended subscription can be renewed.');
  const pay: SubPayment = {
    id: crypto.randomUUID(),
    subscriptionId: subId,
    kind: input.kind,
    amountCents: input.kind === 'new' ? sub.amountCents : sub.plan.renewalCents,
    methodLabel: input.methodLabel.slice(0, 80),
    reference,
    paidOn: input.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ? input.paidOn : null,
    status: 'submitted',
    createdAt: Date.now(),
  };
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('buyer_sub_payments')
      .insert({ id: pay.id, subscription_id: subId, kind: pay.kind, amount_cents: pay.amountCents, method_label: pay.methodLabel, reference, paid_on: pay.paidOn });
    if (error) return fail(error.code === '23505' ? 409 : 500, error.code === '23505' ? 'This reference was already used.' : 'Could not save the payment.');
  } else {
    if (mem.pays.some((p) => p.status !== 'rejected' && p.reference.toUpperCase() === reference.toUpperCase())) return fail(409, 'This reference was already used.');
    mem.pays.push(pay);
  }
  if (input.kind === 'new') await updateSub(subId, { status: 'payment_review' });
  await logEvent({ subscriptionId: subId, actorId: buyerId, event: input.kind === 'new' ? 'payment_submitted' : 'renewal_submitted', meta: { amount: pay.amountCents } });
  return ok(pay);
}

/* An admin checks a payment against the bank or wallet: verified starts (or renews) the subscription; rejected sends it back. */
export async function decidePayment(adminId: string | null, paymentId: string, verified: boolean, now = Date.now()): Promise<R<Subscription>> {
  const pays = (await pg())
    ? (((await createAdminClient().from('buyer_sub_payments').select('*').eq('id', paymentId)).data ?? []) as Record<string, unknown>[]).map(payFrom)
    : mem.pays.filter((p) => p.id === paymentId);
  const pay = pays[0];
  if (!pay || pay.status !== 'submitted') return fail(404, 'No payment waiting with this id.');
  const sub = await subById(pay.subscriptionId);
  if (!sub) return fail(404, 'No such subscription.');
  const status = verified ? 'verified' : 'rejected';
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('buyer_sub_payments')
      .update({ status, decided_by: adminId, decided_at: new Date(now).toISOString() })
      .eq('id', paymentId)
      .eq('status', 'submitted');
    if (error) return fail(500, 'Could not save the decision.');
  } else mem.pays = mem.pays.map((p) => (p.id === paymentId ? { ...p, status } : p));
  let next = sub;
  if (!verified) {
    if (pay.kind === 'new') await updateSub(sub.id, { status: 'pending_payment' });
  } else if (pay.kind === 'new') {
    const a = activation(sub.plan, now);
    await updateSub(sub.id, { status: 'active', ...a });
    next = { ...sub, status: 'active', ...a };
    await notify(sub.buyerId, 'sub_active', { title: sub.plan.name, credits: String(a.creditsTotal) });
  } else {
    const until = renewedUntil(sub.plan, sub.expiresAt, now);
    await updateSub(sub.id, { status: 'active', expiresAt: until, remindedAt: null });
    await extendSelections(sub.id, until);
    next = { ...sub, status: 'active', expiresAt: until };
    await notify(sub.buyerId, 'sub_renewed', { title: sub.plan.name, until: new Date(until).toISOString().slice(0, 10) });
  }
  await audit(adminId, `buyer_sub_payment_${status}`, 'buyer_subscription', sub.id, { kind: pay.kind, amount: pay.amountCents });
  await logEvent({ subscriptionId: sub.id, actorId: adminId, event: `payment_${status}`, meta: { kind: pay.kind, amount: pay.amountCents } });
  return ok(next);
}

async function extendSelections(subId: string, until: number) {
  if (await pg())
    await createAdminClient()
      .from('buyer_sub_selections')
      .update({ licence_expires_at: iso(until), support_until: iso(until) })
      .eq('subscription_id', subId);
  else mem.sels = mem.sels.map((x) => (x.subscriptionId === subId ? { ...x, licenceExpiresAt: until, supportUntil: until } : x));
}

/* Approve (start without a payment record), reject, suspend, cancel or reopen; only the moves in ADMIN_MOVES. */
export async function adminMove(adminId: string | null, subId: string, to: SubStatus, reason: string, now = Date.now()): Promise<R<Subscription>> {
  const sub = await subById(subId);
  if (!sub) return fail(404, 'No such subscription.');
  if (!ADMIN_MOVES[sub.status].includes(to)) return fail(409, `A subscription that is ${sub.status.replace('_', ' ')} cannot become ${to.replace('_', ' ')}.`);
  const patch: Partial<Subscription> = { status: to };
  if (to === 'active' && !sub.startsAt) Object.assign(patch, activation(sub.plan, now));
  if (!(await updateSub(subId, patch))) return fail(500, 'Could not save the change.');
  if (to === 'active' && !sub.startsAt) await notify(sub.buyerId, 'sub_active', { title: sub.plan.name, credits: String(sub.plan.websiteLimit) });
  await audit(adminId, `buyer_sub_${to}`, 'buyer_subscription', subId, { from: sub.status, reason: reason.slice(0, 300) });
  await logEvent({ subscriptionId: subId, actorId: adminId, event: `status_${to}`, meta: { from: sub.status, reason: reason.slice(0, 300) } });
  return ok({ ...sub, ...patch });
}

/*
 * Record that a verified payment was refunded (owner, 2026-11-12). The money goes back by hand, outside SellOnBay, like the payment itself;
 * this only records it, once. The affiliate program then reverses that payment's commission on its next run. Needs migration 0087.
 */
export async function refundPayment(adminId: string | null, paymentId: string, reason: string, now = Date.now()): Promise<R<SubPayment>> {
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return fail(400, 'Give the reason for the refund.');
  let pay: SubPayment | undefined;
  if (await pg()) {
    const db = createAdminClient();
    pay = (((await db.from('buyer_sub_payments').select('*').eq('id', paymentId)).data ?? []) as Record<string, unknown>[]).map(payFrom)[0];
    if (!pay || pay.status !== 'verified') return fail(404, 'No verified payment with this id.');
    if (pay.refundedAt) return fail(409, 'This payment was already refunded.');
    const { data, error } = await db
      .from('buyer_sub_payments')
      .update({ refunded_at: new Date(now).toISOString(), refunded_by: adminId, refund_reason: why })
      .eq('id', paymentId)
      .eq('status', 'verified')
      .is('refunded_at', null)
      .select('id');
    if (error) return fail(error.code === '42703' ? 503 : 500, error.code === '42703' ? 'Refunds need migration 0087.' : 'Could not record the refund.');
    if (!data?.length) return fail(409, 'This payment was already refunded.');
  } else {
    pay = mem.pays.find((p) => p.id === paymentId);
    if (!pay || pay.status !== 'verified') return fail(404, 'No verified payment with this id.');
    if (pay.refundedAt) return fail(409, 'This payment was already refunded.');
    mem.pays = mem.pays.map((p) => (p.id === paymentId ? { ...p, refundedAt: now, refundReason: why } : p));
  }
  await audit(adminId, 'buyer_sub_payment_refunded', 'buyer_subscription', pay.subscriptionId, { payment: paymentId, amount: pay.amountCents, reason: why });
  await logEvent({ subscriptionId: pay.subscriptionId, actorId: adminId, event: 'payment_refunded', meta: { payment: paymentId, amount: pay.amountCents, reason: why } });
  return ok({ ...pay, refundedAt: now, refundReason: why });
}

/* Cancel a subscription and refund its latest verified payment in one admin step ("cancel with refund"). */
export async function cancelWithRefund(adminId: string | null, subId: string, reason: string, now = Date.now()): Promise<R<Subscription>> {
  const sub = await subById(subId);
  if (!sub) return fail(404, 'No such subscription.');
  const pays = (await subsOf(sub.buyerId)).find((x) => x.sub.id === subId)?.payments ?? [];
  const last = pays.filter((p) => p.status === 'verified' && !p.refundedAt).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!last) return fail(409, 'This subscription has no verified payment to refund.');
  const moved = sub.status === 'cancelled' ? ok(sub) : await adminMove(adminId, subId, 'cancelled', reason, now);
  if (!moved.ok) return moved;
  const r = await refundPayment(adminId, last.id, reason, now);
  return r.ok ? moved : r;
}

/* Add days to a running subscription, and to the websites already chosen with it. */
export async function adminExtend(adminId: string | null, subId: string, daysRaw: unknown, now = Date.now()): Promise<R<Subscription>> {
  const days = checkExtendDays(daysRaw);
  if (!days) return fail(400, 'Extend by 1 to 3650 days.');
  const sub = await subById(subId);
  if (!sub || !sub.expiresAt) return fail(404, 'Only a started subscription can be extended.');
  const until = Math.max(now, sub.expiresAt) + days * DAY;
  await updateSub(subId, { expiresAt: until, status: sub.status === 'expired' ? 'active' : sub.status });
  await extendSelections(subId, until);
  await audit(adminId, 'buyer_sub_extended', 'buyer_subscription', subId, { days });
  await logEvent({ subscriptionId: subId, actorId: adminId, event: 'extended', meta: { days } });
  return ok({ ...sub, expiresAt: until });
}

/*
 * A subscriber chooses a website. The credit is taken in the database under a row lock (buyer_sub_take_credit), then a $0 order releases the
 * files through the normal signed, logged download links. If anything after the credit fails, the credit is given back.
 */
export async function pickWebsite(buyerId: string, subId: string, productKey: string, now = Date.now()): Promise<R<Selection>> {
  const sub = await subById(subId);
  if (!sub || sub.buyerId !== buyerId) return fail(404, 'No such subscription.');
  if (!isLive(sub, now)) return fail(409, 'This subscription is not active.');
  if (!creditsLeft(sub)) return fail(409, 'You have chosen all the websites this plan includes.');
  const found = await productRecord(productKey);
  if (!found || found.status !== 'live' || !found.product.dbId) return fail(404, 'This website is not available.');
  const p = found.product;
  const plan = await planById(sub.planId);
  if (!subscribable(p)) return fail(409, 'Only SellOnBay websites can be chosen with a subscription.');
  if (plan && !eligible(plan.eligibility, { id: p.id, category: p.cat })) return fail(409, 'This website is not part of your plan.');
  if (p.sellerId === buyerId) return fail(409, 'This is your own website.');
  const mine = (await subsOf(buyerId)).find((x) => x.sub.id === subId);
  if (mine?.selections.some((x) => x.productKey === p.id)) return fail(409, 'You already chose this website.');

  const usePg = await pg();
  if (usePg) {
    const { error } = await createAdminClient().rpc('buyer_sub_take_credit', { p_sub: subId, p_buyer: buyerId });
    if (error) return fail(409, /no_credits/.test(error.message) ? 'You have chosen all the websites this plan includes.' : 'This subscription is not active.');
  } else mem.subs.set(subId, { ...sub, creditsUsed: sub.creditsUsed + 1 });
  const giveBack = async () => {
    if (usePg) await createAdminClient().rpc('buyer_sub_return_credit', { p_sub: subId });
    else mem.subs.set(subId, { ...sub });
  };
  try {
    const order = await insertBetaOrder(
      {
        title: p.name,
        buyerId,
        sellerId: p.sellerId ?? null,
        productId: p.dbId,
        productKey: p.id,
        deliveryType: p.repo ? 'repo_access' : 'download',
        days: p.days,
        hours: p.hours,
        licence: 'standard',
        meta: { amount: 0, method: 'subscription', subscription: subId, licence: sub.plan.licenceVersion },
        via: 'subscription',
      },
      now,
    );
    await move(order.id, 'beta_approved', { actorId: buyerId, event: 'subscription_pick', meta: { subscription: subId }, now });
    const sel: Selection = {
      id: crypto.randomUUID(),
      subscriptionId: subId,
      productId: p.dbId!, // checked above (a live listing with a database id)
      productKey: p.id,
      orderId: order.id,
      licenceExpiresAt: sub.expiresAt!,
      supportUntil: Math.min(sub.expiresAt!, now + sub.plan.supportDays * DAY),
      createdAt: now,
    };
    if (usePg) {
      const { error } = await createAdminClient()
        .from('buyer_sub_selections')
        .insert({
          id: sel.id,
          subscription_id: subId,
          product_id: sel.productId,
          product_key: sel.productKey,
          order_id: sel.orderId,
          licence_expires_at: iso(sel.licenceExpiresAt),
          support_until: iso(sel.supportUntil),
        });
      if (error) throw new Error(error.message);
    } else mem.sels.push(sel);
    await logEvent({ subscriptionId: subId, actorId: buyerId, event: 'website_chosen', meta: { product: p.id, order: order.id } });
    return ok(sel);
  } catch (e) {
    console.error(JSON.stringify({ event: 'buyer_sub_pick_failed', message: e instanceof Error ? e.message : String(e) }));
    await giveBack();
    return fail(500, 'Could not add this website. Nothing was used; please try again.');
  }
}

/* ---------- admin lists and reports ---------- */
export type AdminSubRow = { sub: Subscription; selections: number; waiting: SubPayment[]; paid: SubPayment[] };
export async function adminSubs(): Promise<{ rows: AdminSubRow[]; payments: SubPayment[] }> {
  let subs: Subscription[];
  let pays: SubPayment[];
  let sels: { subscriptionId: string }[];
  if (!(await pg())) {
    subs = [...mem.subs.values()];
    pays = mem.pays;
    sels = mem.sels;
  } else {
    const db = createAdminClient();
    subs = (((await db.from('buyer_subscriptions').select('*').order('created_at', { ascending: false }).limit(500)).data ?? []) as SubRow[]).map(subFrom);
    pays = (((await db.from('buyer_sub_payments').select('*').order('created_at', { ascending: false }).limit(1000)).data ?? []) as Record<string, unknown>[]).map(payFrom);
    sels = (((await db.from('buyer_sub_selections').select('subscription_id').limit(5000)).data ?? []) as { subscription_id: string }[]).map((x) => ({ subscriptionId: x.subscription_id }));
  }
  return {
    rows: subs
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((sub) => ({
        sub,
        selections: sels.filter((x) => x.subscriptionId === sub.id).length,
        waiting: pays.filter((p) => p.subscriptionId === sub.id && p.status === 'submitted'),
        paid: pays.filter((p) => p.subscriptionId === sub.id && p.status === 'verified'),
      })),
    payments: pays,
  };
}

export function subReport(rows: AdminSubRow[], payments: SubPayment[], now = Date.now()) {
  const verified = payments.filter((p) => p.status === 'verified' && !p.refundedAt);
  return {
    active: rows.filter((r) => isLive(r.sub, now)).length,
    waiting: rows.filter((r) => ['pending_payment', 'payment_review'].includes(r.sub.status)).length,
    expiringSoon: rows.filter((r) => isLive(r.sub, now) && r.sub.expiresAt! - now < 30 * DAY).length,
    expired: rows.filter((r) => r.sub.status === 'expired').length,
    revenueCents: verified.reduce((s, p) => s + p.amountCents, 0),
    newSales: verified.filter((p) => p.kind === 'new').length,
    renewals: verified.filter((p) => p.kind === 'renewal').length,
  };
}

/* The scheduled job (POST /api/cron/orders): ends subscriptions past their date and sends one reminder per term before the end. */
export async function runSubJobs(now = Date.now()): Promise<{ expired: number; reminded: number }> {
  const { rows } = await adminSubs();
  let expired = 0,
    reminded = 0;
  for (const { sub } of rows) {
    if (sub.status === 'active' && sub.expiresAt && sub.expiresAt <= now) {
      if (await updateSub(sub.id, { status: 'expired' })) {
        expired++;
        await logEvent({ subscriptionId: sub.id, actorId: null, event: 'expired' });
      }
    } else if (dueForReminder(sub, now)) {
      await notify(sub.buyerId, 'sub_expiring', { title: sub.plan.name, until: new Date(sub.expiresAt!).toISOString().slice(0, 10) }, { dedupe: `sub-exp:${sub.id}:${sub.expiresAt}` });
      await updateSub(sub.id, { remindedAt: now });
      reminded++;
    }
  }
  return { expired, reminded };
}
