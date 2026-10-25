import { supabaseConfigured, supabaseUrl } from '../supabase/env';
import { MAINTENANCE_LIMITS, MODULES, isModuleKey, type ModuleKey } from './config';

/*
 * Which modules are in maintenance right now. Read by proxy.ts on every request and by the server guards, so it imports nothing that only
 * works inside a page (no 'server-only', no next/headers). The database (module_maintenance, migration 0049) is the truth for every app
 * instance; each instance keeps it for a few seconds, and a change on this instance is seen at once. Without Supabase or before 0049 is
 * pushed, the state lives in this server's memory (demo). If the database cannot be read, modules stay OPEN: a database problem must never
 * close the whole site.
 */
export type ModuleRow = { key: ModuleKey; enabled: boolean; message: string; startAt: number | null; endAt: number | null; updatedBy: string | null; updatedAt: number };
export type Source = 'db' | 'memory';

const CACHE_MS = 10_000;
type Cache = { at: number; rows: ModuleRow[]; source: Source };
const g = globalThis as { __maintMem?: Map<ModuleKey, ModuleRow>; __maintCache?: Cache };
export const memoryRows = (g.__maintMem ??= new Map());

/* Is this row closing its module at this moment? On, and inside its window when one is set. */
export function isActive(r: Pick<ModuleRow, 'enabled' | 'startAt' | 'endAt'>, now = Date.now()): boolean {
  return r.enabled && (r.startAt === null || now >= r.startAt) && (r.endAt === null || now < r.endAt);
}

/* Seconds a client should wait before trying again: until the planned end, or a default when no end is set. */
export function retryAfterSeconds(r: Pick<ModuleRow, 'endAt'>, now = Date.now()): number {
  if (r.endAt === null) return MAINTENANCE_LIMITS.defaultRetrySeconds;
  return Math.min(MAINTENANCE_LIMITS.maxRetrySeconds, Math.max(30, Math.ceil((r.endAt - now) / 1000)));
}

export const defaultMessage = (key: ModuleKey) => `${MODULES[key].label} is being updated for a short while. Everything else on the site works as usual.`;
export const shownMessage = (r: Pick<ModuleRow, 'key' | 'message'>) => r.message.trim() || defaultMessage(r.key);

type DbRow = { module_key: string; enabled: boolean; message: string | null; start_at: string | null; end_at: string | null; updated_by: string | null; updated_at: string };
const time = (s: string | null) => (s ? Date.parse(s) : null);
export const fromDb = (r: DbRow): ModuleRow | null =>
  isModuleKey(r.module_key)
    ? { key: r.module_key, enabled: !!r.enabled, message: r.message ?? '', startAt: time(r.start_at), endAt: time(r.end_at), updatedBy: r.updated_by, updatedAt: Date.parse(r.updated_at) }
    : null;

const dbConfigured = () => supabaseConfigured && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Every saved row. 'memory' means the table is not there (demo, or migration 0049 not pushed yet). */
export async function readRows(now = Date.now()): Promise<Cache> {
  const c = g.__maintCache;
  if (c && now - c.at < CACHE_MS) return c;
  let next: Cache = { at: now, rows: [...memoryRows.values()], source: 'memory' };
  if (dbConfigured()) {
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const res = await fetch(`${supabaseUrl}/rest/v1/module_maintenance?select=module_key,enabled,message,start_at,end_at,updated_by,updated_at`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(2_000),
      });
      if (res.ok) next = { at: now, rows: ((await res.json()) as DbRow[]).map(fromDb).filter((r): r is ModuleRow => !!r), source: 'db' };
      else if (res.status !== 404 && !(await res.text()).includes('module_maintenance')) next = c ? { ...c, at: now } : { at: now, rows: [], source: 'db' }; // a passing error: keep what we had, else everything open (and a save still goes to the database)
    } catch {
      next = c ? { ...c, at: now } : { at: now, rows: [], source: 'db' }; // unreachable: keep the last answer, else everything open
    }
  }
  g.__maintCache = next;
  return next;
}

/* Forget the cached answer (after a change on this instance). */
export const forgetRows = () => {
  g.__maintCache = undefined;
};

/* The row closing this module now, or null when it is open. */
export async function closedRow(key: ModuleKey, now = Date.now()): Promise<ModuleRow | null> {
  const r = (await readRows(now)).rows.find((x) => x.key === key);
  return r && isActive(r, now) ? r : null;
}
