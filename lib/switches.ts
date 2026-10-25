import 'server-only';
import { audit } from './admin/audit';
import { isNewAccount } from './guard';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Emergency switches an admin can flip without a deploy. One today: pause checkout for new buyers (a signed-out visitor or an account younger than
 * CONFIG.limits.newAccountDays). People who already have an account of some age are not affected, so a flood stops without closing the shop.
 */
export const SWITCHES = { pause_new_buyer_checkout: 'Pause checkout for new buyers' } as const;
export type SwitchKey = keyof typeof SWITCHES;
export type SwitchState = { key: SwitchKey; label: string; enabled: boolean; reason?: string; changedAt?: number };
export type Result = { ok: true } | { ok: false; status: number; error: string };

const mem: Map<string, { enabled: boolean; reason?: string; at: number }> = ((globalThis as { __switchMem?: Map<string, { enabled: boolean; reason?: string; at: number }> }).__switchMem ??=
  new Map());

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('switches').select('key').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

export async function isOn(key: SwitchKey): Promise<boolean> {
  if (await pg()) {
    const { data } = await createAdminClient().from('switches').select('enabled').eq('key', key).maybeSingle();
    return !!data?.enabled;
  }
  return !!mem.get(key)?.enabled;
}

export async function switchStates(): Promise<SwitchState[]> {
  const keys = Object.keys(SWITCHES) as SwitchKey[];
  const rows = new Map<string, { enabled: boolean; reason?: string; at: number }>();
  if (await pg()) {
    const { data } = await createAdminClient().from('switches').select('key, enabled, reason, changed_at');
    for (const r of data ?? []) rows.set(r.key, { enabled: r.enabled, reason: r.reason ?? undefined, at: Date.parse(r.changed_at) });
  } else for (const [k, v] of mem) rows.set(k, v);
  return keys.map((key) => ({ key, label: SWITCHES[key], enabled: !!rows.get(key)?.enabled, reason: rows.get(key)?.reason, changedAt: rows.get(key)?.at }));
}

export async function setSwitch(adminId: string | null, key: SwitchKey, enabled: boolean, reason: string): Promise<Result> {
  const why = reason.trim();
  if (!(key in SWITCHES)) return { ok: false, status: 400, error: 'Unknown switch.' };
  if (why.length < 5) return { ok: false, status: 400, error: 'Write why (at least 5 characters). It goes in the audit log.' };
  if (why.length > 500) return { ok: false, status: 400, error: 'Keep the reason under 500 characters.' };
  if (await pg()) {
    const { error } = await createAdminClient().from('switches').upsert({ key, enabled, reason: why, changed_by: adminId, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save the switch.' };
  } else mem.set(key, { enabled, reason: why, at: Date.now() });
  await audit(adminId, enabled ? 'switch_on' : 'switch_off', 'switch', key, { reason: why });
  return { ok: true };
}

export const PAUSED_TEXT = 'Checkout is paused for new accounts for a short while. Please try again later, or come back with an account that is a few days old.';

/* Is this buyer stopped by the pause? Only while the switch is on, and only a signed-out visitor or a new account. */
export async function checkoutPausedFor(buyerId: string | null, now = Date.now()): Promise<boolean> {
  if (!(await isOn('pause_new_buyer_checkout'))) return false;
  return buyerId === null || (await isNewAccount(buyerId, now));
}
