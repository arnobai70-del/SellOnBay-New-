import 'server-only';
import { tx } from './i18n/tx';
import { auditStrict } from './admin/audit';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';
import { FLAGS, flagDef, isFlagKey, type FlagKey } from './featureFlagRegistry';

/*
 * Admin-managed feature flags (R-4). Only the optional features declared in lib/featureFlagRegistry.ts can be switched, by a Super Admin with
 * a reason, audited. Stored in the existing audited `switches` table (migration 0032) under the key "flag:<name>", so no new table is needed.
 *
 * Mandatory controls have NO flag and must never read one: payment verification, release approval, file scanning, private immutable storage,
 * permissions and audit logging (owner, section 1.5 / addendum 6.9). tests/unit/feature-flags.test.ts checks both rules.
 */
export type FlagState = { key: FlagKey; label: string; area: string; on: boolean; reason?: string; changedAt?: number };
export type Result = { ok: true } | { ok: false; status: number; error: string };

const PREFIX = 'flag:';
const mem: Map<string, { on: boolean; reason?: string; at: number }> = ((globalThis as { __flagMem?: Map<string, { on: boolean; reason?: string; at: number }> }).__flagMem ??= new Map());
const cache = globalThis as { __flagCache?: { at: number; rows: Map<string, { on: boolean; reason?: string; at: number }> } };

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('switches').select('key').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

async function rows(now = Date.now()): Promise<Map<string, { on: boolean; reason?: string; at: number }>> {
  if (cache.__flagCache && now - cache.__flagCache.at < 10_000) return cache.__flagCache.rows;
  const out = new Map<string, { on: boolean; reason?: string; at: number }>();
  if (await pg()) {
    const { data, error } = await createAdminClient().from('switches').select('key, enabled, reason, changed_at').like('key', `${PREFIX}%`);
    // A database error leaves every optional feature OFF: an optional feature is never switched on by a fault.
    if (!error) for (const r of data ?? []) out.set(r.key.slice(PREFIX.length), { on: !!r.enabled, reason: r.reason ?? undefined, at: Date.parse(r.changed_at) });
  } else for (const [k, v] of mem) out.set(k, v);
  cache.__flagCache = { at: now, rows: out };
  return out;
}
export const forgetFlags = () => {
  cache.__flagCache = undefined;
};

/* Is this optional feature on? Unknown or unsaved flags use their declared default (always off for new features). */
export async function isFlagOn(key: FlagKey): Promise<boolean> {
  const saved = (await rows()).get(key);
  return saved ? saved.on : FLAGS[key].default;
}

export async function flagStates(): Promise<FlagState[]> {
  const saved = await rows();
  return (Object.keys(FLAGS) as FlagKey[]).map((key) => {
    const s = saved.get(key);
    return { key, label: FLAGS[key].label, area: FLAGS[key].area, on: s ? s.on : FLAGS[key].default, reason: s?.reason, changedAt: s?.at };
  });
}

/* Switches one declared flag. Super Admin only (checked by the caller with adminOnly('super')), reason required, audited before it counts. */
export async function setFlag(adminId: string | null, key: string, on: boolean, reason: string): Promise<Result> {
  if (!isFlagKey(key)) return { ok: false, status: 400, error: tx('Unknown feature.') };
  const why = reason.trim();
  if (why.length < 5) return { ok: false, status: 400, error: tx('Write why (at least 5 characters). It goes in the audit log.') };
  if (why.length > 500) return { ok: false, status: 400, error: tx('Keep the reason under 500 characters.') };
  const locked = flagDef(key).locked;
  if (locked && on) return { ok: false, status: 409, error: locked };
  const before = await isFlagOn(key);
  if (before === on) return { ok: false, status: 409, error: on ? 'It is already on.' : 'It is already off.' };
  // The audit entry is written first: a change that cannot be recorded is not made.
  await auditStrict(adminId, on ? 'flag_on' : 'flag_off', 'feature_flag', key, { reason: why, from: before, to: on });
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('switches')
      .upsert({ key: PREFIX + key, enabled: on, reason: why, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: tx('Could not save the change.') };
  } else mem.set(key, { on, reason: why, at: Date.now() });
  forgetFlags();
  return { ok: true };
}
