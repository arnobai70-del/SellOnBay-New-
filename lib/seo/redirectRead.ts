import { supabaseConfigured, supabaseUrl } from '../supabase/env';
import { cleanRedirects, type Redirect } from './redirectsCore';

/*
 * Reads the saved address changes for proxy.ts, which cannot use the server client (same reason as lib/maintenance/state.ts). Kept for 30 seconds per
 * server copy and forgotten at once after a change on this copy. If the database cannot be read, nothing is redirected: a database problem must never
 * send visitors anywhere. Without Supabase (demo) the rules live in this server's memory.
 */
const KEY = 'seo:redirects';
const g = globalThis as { __redirectMem?: { list: Redirect[] }; __redirectCache?: { at: number; list: Redirect[] } };
export const redirectMem = (g.__redirectMem ??= { list: [] });

export const forgetRedirects = () => {
  g.__redirectCache = undefined;
};

export async function savedRedirects(now = Date.now()): Promise<Redirect[]> {
  const c = g.__redirectCache;
  if (c && now - c.at < 30_000) return c.list;
  let list = redirectMem.list;
  if (supabaseConfigured && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const res = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.${KEY}`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(1_500),
      });
      list = res.ok ? cleanRedirects(((await res.json()) as { value: unknown }[])[0]?.value) : (c?.list ?? []);
    } catch {
      list = c?.list ?? [];
    }
  }
  g.__redirectCache = { at: now, list };
  return list;
}
