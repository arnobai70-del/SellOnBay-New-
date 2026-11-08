import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { FLAT_PLAN, PLANS_V1, isPlanCode, type Billing, type Plan, type PlanCode, type SubState } from './rules';

/*
 * Where plans and subscriptions are kept: Postgres (migration 0057) when it is there, otherwise memory (tests and demo mode), like the other
 * stores. Only lib/plans/service.ts writes; everything else reads.
 */
export type Subscription = {
  id: string;
  sellerId: string;
  planId: string;
  billing: Billing;
  status: SubState;
  priceCents: number;
  periodStart?: number;
  periodEnd?: number;
  createdAt: number;
  updatedAt: number;
};
export type SubEvent = { subscriptionId: string; actorId: string | null; event: string; from: SubState | null; to: SubState | null; reason: string; meta: Record<string, unknown>; at: number };

type Mem = { subs: Map<string, Subscription>; events: SubEvent[]; listings: Map<string, number> };
const mem: Mem = ((globalThis as { __plansMem?: Mem }).__plansMem ??= { subs: new Map(), events: [], listings: new Map() });

let ready: { ok: boolean; at: number } | undefined;
export async function plansPg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('seller_plans').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

type PlanRow = { id: string; code: string; version: number; name: string; monthly_cents: number; yearly_cents: number; commission_bps: number; listing_limit: number; featured: boolean };
const toPlan = (r: PlanRow): Plan | null =>
  isPlanCode(r.code)
    ? {
        id: r.id,
        code: r.code,
        version: r.version,
        name: r.name,
        monthlyCents: r.monthly_cents,
        yearlyCents: r.yearly_cents,
        commissionBps: r.commission_bps,
        listingLimit: r.listing_limit,
        featured: r.featured,
      }
    : null;

/* The plan offered now under a code: its newest version in effect. */
export async function currentPlan(code: PlanCode, now = Date.now()): Promise<Plan> {
  if (!(await plansPg())) return code === 'free' ? FLAT_PLAN : PLANS_V1[code];
  const { data } = await createAdminClient()
    .from('seller_plans')
    .select('id, code, version, name, monthly_cents, yearly_cents, commission_bps, listing_limit, featured')
    .eq('code', code)
    .eq('offered', true)
    .lte('effective_from', new Date(now).toISOString())
    .order('version', { ascending: false })
    .limit(1);
  const p = data?.[0] ? toPlan(data[0] as PlanRow) : null;
  if (!p) throw new Error(`No ${code} plan is configured.`);
  return p;
}

export async function planById(id: string): Promise<Plan | null> {
  if (!(await plansPg())) return Object.values(PLANS_V1).find((p) => p.id === id) ?? null;
  const { data } = await createAdminClient().from('seller_plans').select('id, code, version, name, monthly_cents, yearly_cents, commission_bps, listing_limit, featured').eq('id', id).maybeSingle();
  return data ? toPlan(data as PlanRow) : null;
}

type SubRow = {
  id: string;
  seller_id: string;
  plan_id: string;
  billing: Billing;
  status: SubState;
  price_cents: number;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};
const toSub = (r: SubRow): Subscription => ({
  id: r.id,
  sellerId: r.seller_id,
  planId: r.plan_id,
  billing: r.billing,
  status: r.status,
  priceCents: r.price_cents,
  periodStart: r.current_period_start ? Date.parse(r.current_period_start) : undefined,
  periodEnd: r.current_period_end ? Date.parse(r.current_period_end) : undefined,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});
const SUB_COLS = 'id, seller_id, plan_id, billing, status, price_cents, current_period_start, current_period_end, created_at, updated_at';

/* The seller's subscription that has not ended, if any (at most one, enforced by the database). */
export async function openSubscription(sellerId: string): Promise<Subscription | null> {
  if (!(await plansPg())) return [...mem.subs.values()].find((s) => s.sellerId === sellerId && s.status !== 'ended') ?? null;
  const { data } = await createAdminClient().from('seller_subscriptions').select(SUB_COLS).eq('seller_id', sellerId).neq('status', 'ended').maybeSingle();
  return data ? toSub(data as SubRow) : null;
}

export async function subscriptionById(id: string): Promise<Subscription | null> {
  if (!(await plansPg())) return mem.subs.get(id) ?? null;
  const { data } = await createAdminClient().from('seller_subscriptions').select(SUB_COLS).eq('id', id).maybeSingle();
  return data ? toSub(data as SubRow) : null;
}

export async function listSubscriptions(filter: { status?: SubState[] } = {}): Promise<Subscription[]> {
  if (!(await plansPg())) return [...mem.subs.values()].filter((s) => !filter.status || filter.status.includes(s.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  let q = createAdminClient().from('seller_subscriptions').select(SUB_COLS).order('updated_at', { ascending: false }).limit(300);
  if (filter.status) q = q.in('status', filter.status);
  const { data } = await q;
  return ((data ?? []) as SubRow[]).map(toSub);
}

export async function subscriptionEvents(subscriptionId: string): Promise<SubEvent[]> {
  if (!(await plansPg())) return mem.events.filter((e) => e.subscriptionId === subscriptionId);
  const { data } = await createAdminClient()
    .from('subscription_events')
    .select('subscription_id, actor_id, event, from_status, to_status, reason, meta, created_at')
    .eq('subscription_id', subscriptionId)
    .order('id');
  return (data ?? []).map((r) => ({
    subscriptionId: r.subscription_id,
    actorId: r.actor_id,
    event: r.event,
    from: r.from_status,
    to: r.to_status,
    reason: r.reason ?? '',
    meta: r.meta ?? {},
    at: Date.parse(r.created_at),
  }));
}

const uuidOrNull = (id: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

/* Creates a subscription and its first event. */
export async function insertSubscription(s: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>, ev: Omit<SubEvent, 'subscriptionId' | 'at'>): Promise<Subscription> {
  const now = Date.now();
  if (!(await plansPg())) {
    if ([...mem.subs.values()].some((x) => x.sellerId === s.sellerId && x.status !== 'ended')) throw new Error('This seller already has an open subscription.');
    const sub: Subscription = { ...s, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    mem.subs.set(sub.id, sub);
    mem.events.push({ ...ev, subscriptionId: sub.id, at: now });
    return sub;
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from('seller_subscriptions')
    .insert({
      seller_id: s.sellerId,
      plan_id: s.planId,
      billing: s.billing,
      status: s.status,
      price_cents: s.priceCents,
      current_period_start: s.periodStart ? new Date(s.periodStart).toISOString() : null,
      current_period_end: s.periodEnd ? new Date(s.periodEnd).toISOString() : null,
    })
    .select(SUB_COLS)
    .single();
  if (error || !data) throw new Error(/duplicate|unique/i.test(error?.message ?? '') ? 'This seller already has an open subscription.' : 'Could not save the subscription.');
  const sub = toSub(data as SubRow);
  const e = await db
    .from('subscription_events')
    .insert({ subscription_id: sub.id, actor_id: uuidOrNull(ev.actorId), event: ev.event, from_status: ev.from, to_status: ev.to, reason: ev.reason, meta: ev.meta });
  if (e.error) throw new Error('Could not log the subscription.');
  return sub;
}

/* Changes a subscription only if it is still in the state the caller saw (no lost update), and logs the event. */
export async function updateSubscription(
  prev: Subscription,
  patch: Partial<Pick<Subscription, 'status' | 'periodStart' | 'periodEnd'>>,
  ev: Omit<SubEvent, 'subscriptionId' | 'at'>,
): Promise<Subscription> {
  const now = Date.now();
  if (!(await plansPg())) {
    const cur = mem.subs.get(prev.id);
    if (!cur || cur.status !== prev.status) throw new Error('The subscription changed meanwhile. Reload and try again.');
    const next = { ...cur, ...patch, updatedAt: now };
    mem.subs.set(prev.id, next);
    mem.events.push({ ...ev, subscriptionId: prev.id, at: now });
    return next;
  }
  const db = createAdminClient();
  const row: Record<string, unknown> = { updated_at: new Date(now).toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.periodStart !== undefined) row.current_period_start = new Date(patch.periodStart).toISOString();
  if (patch.periodEnd !== undefined) row.current_period_end = new Date(patch.periodEnd).toISOString();
  const { data, error } = await db.from('seller_subscriptions').update(row).eq('id', prev.id).eq('status', prev.status).select(SUB_COLS);
  if (error) throw new Error('Could not save the subscription.');
  if (!data?.length) throw new Error('The subscription changed meanwhile. Reload and try again.');
  const e = await db
    .from('subscription_events')
    .insert({ subscription_id: prev.id, actor_id: uuidOrNull(ev.actorId), event: ev.event, from_status: ev.from, to_status: ev.to, reason: ev.reason, meta: ev.meta });
  if (e.error) throw new Error('Could not log the subscription change.');
  return toSub(data[0] as SubRow);
}

/* Listings that count against the plan limit: live plus waiting for review. */
export async function publishedOrWaiting(sellerId: string): Promise<number> {
  if (!(await plansPg())) return mem.listings.get(sellerId) ?? 0;
  const { count } = await createAdminClient().from('products').select('id', { count: 'exact', head: true }).eq('seller_id', sellerId).in('status', ['live', 'in_review']);
  return count ?? 0;
}

/* Tests only: how many listings a seller has in memory mode. */
export const setMemListings = (sellerId: string, n: number) => mem.listings.set(sellerId, n);
