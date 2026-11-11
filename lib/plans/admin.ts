import 'server-only';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { isPlanCode, PLANS_V1, FLAT_PLAN, PLAN_CODES, type Plan, type PlanCode } from './rules';
import { plansPg } from './store';

/*
 * Seller subscriptions in Admin › Subscription Management (owner, 2026-11-12), on top of the existing system (migration 0057, lib/plans):
 * no new table. A plan edit is a new row in seller_plans (the next version, effective now), exactly as the system was built: a running seller
 * subscription keeps the version it points to, and every order keeps the fee it recorded. "Withdraw" sets offered = false on every version of
 * a code (rows are never deleted); "Offer" saves a new offered version. The on/off switch and the words shown to sellers (description, badge,
 * benefits, order, visibility) are one shop setting, seller_subs:settings. Every change is audited.
 */
export type SellerDisplay = { description: string; badge: string; benefits: { text: string; on: boolean }[]; sort: number; visible: boolean };
export type SellerSubSettings = { enabled: boolean; display: Record<PlanCode, SellerDisplay> };
type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const KEY = 'seller_subs:settings';
const DEFAULT_DISPLAY = (i: number): SellerDisplay => ({ description: '', badge: '', benefits: [], sort: i, visible: true });
const g = globalThis as { __sellerSubs?: { settings: SellerSubSettings; versions: Plan[]; offered: Record<string, boolean> } };
const mem = (g.__sellerSubs ??= {
  settings: { enabled: false, display: Object.fromEntries(PLAN_CODES.map((c, i) => [c, DEFAULT_DISPLAY(i)])) as Record<PlanCode, SellerDisplay> },
  versions: [FLAT_PLAN, PLANS_V1.pro, PLANS_V1.business],
  offered: { free: true, pro: false, business: false },
});

const cleanDisplay = (raw: unknown, i: number): SellerDisplay => {
  const d = (raw ?? {}) as Partial<SellerDisplay>;
  return {
    description: String(d.description ?? '')
      .trim()
      .slice(0, 400),
    badge: String(d.badge ?? '')
      .trim()
      .slice(0, 30),
    benefits: Array.isArray(d.benefits)
      ? d.benefits
          .map((b) => ({
            text: String(b?.text ?? '')
              .trim()
              .slice(0, 120),
            on: b?.on !== false,
          }))
          .filter((b) => b.text)
          .slice(0, 20)
      : [],
    sort: Number.isInteger(d.sort) ? Number(d.sort) : i,
    visible: d.visible !== false,
  };
};

export async function sellerSubSettings(): Promise<SellerSubSettings> {
  if (!(await plansPg())) return mem.settings;
  const { data } = await createAdminClient().from('app_settings').select('value').eq('key', KEY).maybeSingle();
  const v = (data?.value ?? {}) as { enabled?: unknown; display?: Record<string, unknown> };
  return { enabled: v.enabled === true, display: Object.fromEntries(PLAN_CODES.map((c, i) => [c, cleanDisplay(v.display?.[c], i)])) as Record<PlanCode, SellerDisplay> };
}

export async function saveSellerSubSettings(adminId: string | null, raw: { enabled?: unknown; display?: Record<string, unknown> }): Promise<R<SellerSubSettings>> {
  const next: SellerSubSettings = { enabled: raw.enabled === true, display: Object.fromEntries(PLAN_CODES.map((c, i) => [c, cleanDisplay(raw.display?.[c], i)])) as Record<PlanCode, SellerDisplay> };
  if (await plansPg()) {
    const { error } = await createAdminClient().from('app_settings').upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return fail(500, 'Could not save the seller settings.');
  } else mem.settings = next;
  await audit(adminId, next.enabled ? 'seller_subs_on' : 'seller_subs_off', 'seller_subs', 'settings');
  return { ok: true, value: next };
}

export type PlanRow = Plan & { offered: boolean; effectiveFrom: number };
type DbRow = {
  id: string;
  code: string;
  version: number;
  name: string;
  monthly_cents: number | null;
  yearly_cents: number | null;
  commission_bps: number | null;
  listing_limit: number | null;
  featured: boolean;
  offered: boolean;
  effective_from: string;
};

/* Every version of the three plans, newest first (the history row legacy-baseline is left out). */
export async function planVersions(): Promise<PlanRow[]> {
  if (!(await plansPg())) return mem.versions.map((p) => ({ ...p, offered: mem.offered[p.code] ?? false, effectiveFrom: 0 })).sort((a, b) => b.version - a.version);
  const { data } = await createAdminClient()
    .from('seller_plans')
    .select('id, code, version, name, monthly_cents, yearly_cents, commission_bps, listing_limit, featured, offered, effective_from')
    .in('code', [...PLAN_CODES])
    .order('version', { ascending: false });
  return ((data ?? []) as DbRow[]).map((r) => ({
    id: r.id,
    code: r.code as PlanCode,
    version: r.version,
    name: r.name,
    monthlyCents: r.monthly_cents ?? 0,
    yearlyCents: r.yearly_cents ?? 0,
    commissionBps: r.commission_bps ?? 0,
    listingLimit: r.listing_limit ?? 0,
    featured: r.featured,
    offered: r.offered,
    effectiveFrom: Date.parse(r.effective_from),
  }));
}

/* The plan under each code that new sellers get now: the newest offered version. */
export const offeredNow = (rows: PlanRow[]) => Object.fromEntries(PLAN_CODES.map((c) => [c, rows.find((r) => r.code === c && r.offered) ?? null])) as Record<PlanCode, PlanRow | null>;

/* An admin's seller plan form, checked. Prices in cents, the commission in basis points (15% = 1500). */
export function checkSellerPlan(raw: Record<string, unknown>): { ok: true; value: Omit<Plan, 'id' | 'version'> } | { ok: false; error: string } {
  const code = raw.code;
  if (!isPlanCode(code)) return { ok: false, error: 'Unknown plan.' };
  const n = (v: unknown, lo: number, hi: number) => (Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : null);
  const name = String(raw.name ?? '')
    .trim()
    .slice(0, 40);
  const monthlyCents = n(raw.monthlyCents, 0, 1_000_000);
  const yearlyCents = n(raw.yearlyCents, 0, 10_000_000);
  const commissionBps = n(raw.commissionBps, 0, 10_000);
  const listingLimit = n(raw.listingLimit, 0, 100_000);
  if (!name) return { ok: false, error: 'Give the plan a name.' };
  if (monthlyCents === null || yearlyCents === null) return { ok: false, error: 'Prices are whole cents from $0.' };
  if (commissionBps === null) return { ok: false, error: 'The commission is 0% to 100%.' };
  if (listingLimit === null) return { ok: false, error: 'The listing limit is 0 or more.' };
  return { ok: true, value: { code, name, monthlyCents, yearlyCents, commissionBps, listingLimit, featured: raw.featured === true } };
}

/* Save a seller plan as its next version, offered from now on. Running subscriptions and recorded fees are not touched. */
export async function savePlanVersion(adminId: string | null, raw: Record<string, unknown>): Promise<R<PlanRow>> {
  const c = checkSellerPlan(raw);
  if (!c.ok) return fail(400, c.error);
  const rows = await planVersions();
  const version = Math.max(0, ...rows.filter((r) => r.code === c.value.code).map((r) => r.version)) + 1;
  let saved: PlanRow;
  if (await plansPg()) {
    const { data, error } = await createAdminClient()
      .from('seller_plans')
      .insert({
        code: c.value.code,
        version,
        name: c.value.name,
        monthly_cents: c.value.monthlyCents,
        yearly_cents: c.value.yearlyCents,
        commission_bps: c.value.commissionBps,
        listing_limit: c.value.listingLimit,
        featured: c.value.featured,
        offered: true,
      })
      .select('id, effective_from')
      .single();
    if (error || !data) return fail(500, 'Could not save the new version.');
    saved = { ...c.value, id: data.id, version, offered: true, effectiveFrom: Date.parse(data.effective_from) };
  } else {
    saved = { ...c.value, id: `plan-${c.value.code}-${version}`, version, offered: true, effectiveFrom: Date.now() };
    mem.versions.push(saved);
    mem.offered[c.value.code] = true;
  }
  await audit(adminId, 'seller_plan_version', 'seller_plan', `${saved.code}-v${version}`, {
    monthly: saved.monthlyCents,
    yearly: saved.yearlyCents,
    commissionBps: saved.commissionBps,
    listingLimit: saved.listingLimit,
  });
  return { ok: true, value: saved };
}

/* Withdraw (no new seller can ask for it) or offer again (the newest version). Free, the plan every seller is on, cannot be withdrawn. */
export async function setPlanOffered(adminId: string | null, code: unknown, offered: boolean): Promise<R<true>> {
  if (!isPlanCode(code)) return fail(400, 'Unknown plan.');
  if (code === 'free' && !offered) return fail(409, 'The Free plan is the one every seller is on; it cannot be withdrawn.');
  const rows = (await planVersions()).filter((r) => r.code === code);
  if (!rows.length) return fail(404, 'No such plan.');
  if (await plansPg()) {
    const db = createAdminClient();
    const { error } = offered ? await db.from('seller_plans').update({ offered: true }).eq('id', rows[0].id) : await db.from('seller_plans').update({ offered: false }).eq('code', code);
    if (error) return fail(500, 'Could not change the plan.');
  } else mem.offered[code] = offered;
  await audit(adminId, offered ? 'seller_plan_offered' : 'seller_plan_withdrawn', 'seller_plan', code);
  return { ok: true, value: true };
}
