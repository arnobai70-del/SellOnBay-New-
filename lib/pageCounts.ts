import 'server-only';
import { dayOf } from './analyticsCore';
import { trustedCountry } from './countryCore';
import { gaPage } from './ga4';
import { createAdminClient } from './supabase/server';
import { supabaseConfigured } from './supabase/env';

/*
 * A cookieless first-party daily count (owner, 2026-11-08; migration 0080 page_counts): one row per day, page and country with a number, and nothing
 * else. No address, no visitor hash, no user id. The page is the cleaned address GA would get (lib/ga4.ts gaPage: ids in private areas become [id]),
 * the country is the host's geo header when the server trusts it (lib/countryCore.ts), else "--". Approximate: no visitor is told from another.
 */
const mem: Map<string, number> = ((globalThis as { __pageCounts?: Map<string, number> }).__pageCounts ??= new Map()); // "day|path|country" -> n
let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if (!supabaseConfigured) return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 60_000)) {
    const { error } = await createAdminClient().from('page_counts').select('day').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

export const countPath = (pathname: string) => gaPage(pathname.split(/[?#]/)[0] || '/').path.slice(0, 200);

export async function countPage(pathname: string, headers: { get(name: string): string | null }, now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<void> {
  try {
    if (!pathname.startsWith('/') || pathname.startsWith('/api/')) return;
    const path = countPath(pathname);
    const country = trustedCountry(headers, env) ?? '--';
    const day = dayOf(now);
    if (await pg()) await createAdminClient().rpc('page_count_hit', { p_day: day, p_path: path, p_country: country });
    else if (mem.size < 20_000) mem.set(`${day}|${path}|${country}`, (mem.get(`${day}|${path}|${country}`) ?? 0) + 1);
  } catch {
    // counting never breaks a page
  }
}

export type PageCountSummary = { days: { day: string; n: number }[]; pages: { path: string; n: number }[]; countries: { code: string; n: number }[]; total: number };

export async function pageCountSummary(from: string, to: string, limit = 10): Promise<PageCountSummary> {
  let rows: { day: string; path: string; country: string; n: number }[] = [];
  if (await pg()) {
    const { data } = await createAdminClient().from('page_counts').select('day, path, country, n').gte('day', from).lte('day', to).limit(20_000);
    rows = (data ?? []) as typeof rows;
  } else
    for (const [k, n] of mem) {
      const [day, path, country] = k.split('|');
      if (day >= from && day <= to) rows.push({ day, path, country, n });
    }
  const sum = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + Number(r.n));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  return {
    days: sum((r) => r.day)
      .map(([day, n]) => ({ day, n }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    pages: sum((r) => r.path)
      .slice(0, limit)
      .map(([path, n]) => ({ path, n })),
    countries: sum((r) => r.country)
      .slice(0, limit)
      .map(([code, n]) => ({ code, n })),
    total: rows.reduce((s, r) => s + Number(r.n), 0),
  };
}
