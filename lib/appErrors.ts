import { errorFingerprint, type ErrorReport } from './monitor';
import { supabaseConfigured } from './supabase/env';
import { adminClientAvailable, createAdminClient } from './supabase/server';

/*
 * Server errors counted per kind and per hour (migration 0072) for the admin "Server and system" page. Fed by lib/monitor.ts, which has
 * already blanked e-mail addresses, keys, tokens and long numbers and keeps no body, header, cookie or address. Never throws: without the
 * table or the database it does nothing, and an error here is not reported again.
 */
export async function logAppError(r: ErrorReport, status = 500): Promise<void> {
  if (!supabaseConfigured || !adminClientAvailable()) return;
  try {
    await createAdminClient().rpc('log_app_error', {
      p_fingerprint: errorFingerprint(r, status),
      p_route: (r.route || r.path).slice(0, 200),
      p_status: status,
      p_message: r.message.split('\n')[0].slice(0, 300),
    });
  } catch {
    /* the count is only for the admin page */
  }
}

export type ErrorKind = { fingerprint: string; route: string; status: number | null; message: string; count: number; firstSeen: number; lastSeen: number };
export type ErrorCounts = { lastHour: number; lastDay: number; lastWeek: number; byHour: number[] }; // byHour: the last 24 hours, oldest first

/* The error counts and the latest kinds; null when the table is not there yet (migration 0072). */
export async function errorSummary(now = Date.now()): Promise<{ counts: ErrorCounts; kinds: ErrorKind[] } | null> {
  if (!supabaseConfigured || !adminClientAvailable()) return { counts: { lastHour: 0, lastDay: 0, lastWeek: 0, byHour: Array(24).fill(0) }, kinds: [] };
  const since = new Date(now - 7 * 86_400_000).toISOString();
  const { data, error } = await createAdminClient()
    .from('app_errors')
    .select('fingerprint, hour, route, status, message, count, first_seen, last_seen')
    .gte('hour', since)
    .order('hour', { ascending: false })
    .limit(2000);
  if (error) return null;
  const rows = data ?? [];
  const hourNow = Math.floor(now / 3_600_000);
  const byHour = Array(24).fill(0) as number[];
  let lastHour = 0,
    lastDay = 0,
    lastWeek = 0;
  const kinds = new Map<string, ErrorKind>();
  for (const r of rows) {
    const h = Math.floor(Date.parse(r.hour) / 3_600_000);
    const age = hourNow - h;
    lastWeek += r.count;
    if (age < 24) {
      lastDay += r.count;
      byHour[23 - age] += r.count;
    }
    if (now - Date.parse(r.last_seen) < 3_600_000) lastHour += r.count;
    const k = kinds.get(r.fingerprint);
    const first = Date.parse(r.first_seen),
      last = Date.parse(r.last_seen);
    if (!k) kinds.set(r.fingerprint, { fingerprint: r.fingerprint, route: r.route, status: r.status, message: r.message, count: r.count, firstSeen: first, lastSeen: last });
    else Object.assign(k, { count: k.count + r.count, firstSeen: Math.min(k.firstSeen, first), lastSeen: Math.max(k.lastSeen, last) });
  }
  return { counts: { lastHour, lastDay, lastWeek, byHour }, kinds: [...kinds.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 15) };
}
