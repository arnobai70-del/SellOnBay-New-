import 'server-only';
import { CONFIG, DAY_MS } from './config';
import { dayOf } from './analyticsCore';
import { trustedCountry, type FirstPartyCountryRow } from './countryCore';
import { isFlagOn } from './featureFlags';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * First-party country counts (Blueprint 8.1 option 2, O-5, migration 0065 analytics_country). A two-letter code per keyed visitor hash and
 * day; the address is never stored. Nothing is recorded unless the "analytics.first_party_country" flag is on (locked until legal approval,
 * B-12) AND the server trusts its proxy's country header (lib/countryCore.ts trustedCountry).
 */
const mem: Map<string, string> = ((globalThis as { __ctryMem?: Map<string, string> }).__ctryMem ??= new Map()); // "day|visitor" -> code
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  const { error } = await createAdminClient().from('analytics_country').select('day').limit(1);
  return !error;
}

export async function recordCountry(visitor: string, headers: { get(name: string): string | null }, now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<boolean> {
  try {
    if (!(await isFlagOn('analytics.first_party_country'))) return false;
    const code = trustedCountry(headers, env);
    if (!code) return false;
    const day = dayOf(now);
    if (!(await pg())) {
      if (!mem.has(`${day}|${visitor}`)) mem.set(`${day}|${visitor}`, code);
      return true;
    }
    const { error } = await createAdminClient().from('analytics_country').upsert({ day, visitor, country: code }, { onConflict: 'day,visitor', ignoreDuplicates: true });
    return !error;
  } catch {
    return false; // counting never breaks a page
  }
}

export async function firstPartyCountries(from: string, to: string): Promise<FirstPartyCountryRow[]> {
  if (!(await pg())) {
    const out = new Map<string, number>();
    for (const [k, code] of mem) {
      const day = k.slice(0, 10);
      if (day >= from && day <= to) out.set(code, (out.get(code) ?? 0) + 1);
    }
    return [...out].map(([code, visitors]) => ({ code, visitors })).sort((a, b) => b.visitors - a.visitors || a.code.localeCompare(b.code));
  }
  const { data } = await createAdminClient().rpc('analytics_countries', { p_from: from, p_to: to });
  return ((data ?? []) as { country: string; visitors: number }[]).map((r) => ({ code: r.country, visitors: Number(r.visitors) }));
}

/* Old rows go with the rest of the visitor analytics (CONFIG.analytics.keepDays). */
export async function purgeCountries(now = Date.now()): Promise<void> {
  const before = dayOf(now - CONFIG.analytics.keepDays * DAY_MS);
  if (!(await pg())) {
    for (const k of mem.keys()) if (k.slice(0, 10) < before) mem.delete(k);
    return;
  }
  await createAdminClient().from('analytics_country').delete().lt('day', before);
}
