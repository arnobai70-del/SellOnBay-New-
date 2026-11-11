import { revalidateTag } from 'next/cache';
import { supabaseConfigured, supabaseUrl } from '../supabase/env';
import { MAINTENANCE_LIMITS, MODULES, isModuleKey, type ModuleKey } from './config';

/*
 * Which modules are in maintenance right now. Read by proxy.ts on every request and by the server guards, so it imports nothing that only
 * works inside a page (no 'server-only', no next/headers). The database (module_maintenance, migration 0049) is the truth for every app
 * instance; each instance keeps it for a few seconds, and a change on this instance is seen at once. Without Supabase or before 0049 is
 * pushed, the state lives in this server's memory (demo). If the database cannot be read, modules stay OPEN: a database problem must never
 * close the whole site.
 */
export type ModuleRow = {
  key: ModuleKey;
  enabled: boolean;
  message: string;
  startAt: number | null;
  endAt: number | null;
  updatedBy: string | null;
  updatedAt: number;
  bannerMinutes?: number; // show a site banner this many minutes before a planned start (migration 0082)
};
/* One page closed by its address (owner, 2026-11-08; migration 0082 page_maintenance). The path closes itself and everything under it. */
export type PageRow = { path: string; enabled: boolean; message: string; startAt: number | null; endAt: number | null; bannerMinutes: number; updatedBy: string | null; updatedAt: number };
export type Source = 'db' | 'memory';

const CACHE_MS = 10_000;
const STALE_MS = 5 * 60_000; // an answer older than this is not served even while refreshing: maintenance on or off shows within minutes at worst
type Cache = { at: number; rows: ModuleRow[]; pages: PageRow[]; allowIps: string[]; source: Source };
const g = globalThis as { __maintMem?: Map<ModuleKey, ModuleRow>; __maintPages?: Map<string, PageRow>; __maintAllow?: string[]; __maintCache?: Cache; __maintRefreshing?: boolean };
export const memoryRows = (g.__maintMem ??= new Map());
export const memoryPages = (g.__maintPages ??= new Map());
export const memoryAllow = (ips?: string[]) => (ips ? (g.__maintAllow = ips) : (g.__maintAllow ?? []));

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

type DbRow = {
  module_key: string;
  enabled: boolean;
  message: string | null;
  start_at: string | null;
  end_at: string | null;
  updated_by: string | null;
  updated_at: string;
  banner_minutes?: number | null;
};
type DbPage = Omit<DbRow, 'module_key'> & { path: string };
const time = (s: string | null) => (s ? Date.parse(s) : null);
export const fromDb = (r: DbRow): ModuleRow | null =>
  isModuleKey(r.module_key)
    ? {
        key: r.module_key,
        enabled: !!r.enabled,
        message: r.message ?? '',
        startAt: time(r.start_at),
        endAt: time(r.end_at),
        updatedBy: r.updated_by,
        updatedAt: Date.parse(r.updated_at),
        bannerMinutes: Number(r.banner_minutes ?? 0),
      }
    : null;
const pageFromDb = (r: DbPage): PageRow => ({
  path: r.path,
  enabled: !!r.enabled,
  message: r.message ?? '',
  startAt: time(r.start_at),
  endAt: time(r.end_at),
  bannerMinutes: Number(r.banner_minutes ?? 0),
  updatedBy: r.updated_by,
  updatedAt: Date.parse(r.updated_at),
});

const dbConfigured = () => supabaseConfigured && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/* Every saved row. 'memory' means the table is not there (demo, or migration 0049 not pushed yet). */
export async function readRows(now = Date.now()): Promise<Cache> {
  const c = g.__maintCache;
  if (c && now - c.at < CACHE_MS) return c;
  // Speed (owner, 2026-11-11): an expired answer is still served at once while one refresh runs in the background, so no request waits on the
  // database round trip. Only the very first request on a server copy, or one after forgetRows(), waits.
  if (c && now - c.at < STALE_MS) {
    if (!g.__maintRefreshing) {
      g.__maintRefreshing = true;
      void loadRows(now, c).finally(() => {
        g.__maintRefreshing = false;
      });
    }
    return c;
  }
  return loadRows(now, c);
}

async function loadRows(now: number, c: Cache | undefined): Promise<Cache> {
  let next: Cache = { at: now, rows: [...memoryRows.values()], pages: [...memoryPages.values()], allowIps: memoryAllow(), source: 'memory' };
  if (dbConfigured()) {
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const get = (q: string) =>
        fetch(`${supabaseUrl}/rest/v1/${q}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, next: { revalidate: 30, tags: ['maintenance'] }, signal: AbortSignal.timeout(2_000) });
      // '*' so this keeps working before migration 0082 adds banner_minutes; pages and the allow-list are optional (before 0082 they are simply empty).
      const [res, pg, allow] = await Promise.all([
        get('module_maintenance?select=*'),
        get('page_maintenance?select=*').catch(() => null),
        get('app_settings?select=value&key=eq.maintenance:allow_ips').catch(() => null),
      ]);
      if (res.ok) {
        const pages = pg?.ok ? ((await pg.json()) as DbPage[]).map(pageFromDb) : [];
        const allowRow = allow?.ok ? ((await allow.json()) as { value: unknown }[])[0]?.value : null;
        const allowIps = Array.isArray(allowRow) ? allowRow.filter((x): x is string => typeof x === 'string') : [];
        next = { at: now, rows: ((await res.json()) as DbRow[]).map(fromDb).filter((r): r is ModuleRow => !!r), pages, allowIps, source: 'db' };
      } else if (res.status !== 404 && !(await res.text()).includes('module_maintenance')) next = c ? { ...c, at: now } : { at: now, rows: [], pages: [], allowIps: [], source: 'db' }; // a passing error: keep what we had, else everything open (and a save still goes to the database)
    } catch {
      next = c ? { ...c, at: now } : { at: now, rows: [], pages: [], allowIps: [], source: 'db' }; // unreachable: keep the last answer, else everything open
    }
  }
  g.__maintCache = next;
  return next;
}

/* Forget the cached answer (after a change on this instance), and the shared fetch cache, so every page sees the change at once. */
export const forgetRows = () => {
  g.__maintCache = undefined;
  try {
    revalidateTag('maintenance', { expire: 0 });
  } catch {
    /* outside a request (tests, scripts): only this instance's copy is forgotten */
  }
};

/* The row closing this module now, or null when it is open. */
export async function closedRow(key: ModuleKey, now = Date.now()): Promise<ModuleRow | null> {
  const r = (await readRows(now)).rows.find((x) => x.key === key);
  return r && isActive(r, now) ? r : null;
}

/* The page rule closing this address now (the address itself or anything under it), or null. */
export async function closedPage(path: string, now = Date.now()): Promise<PageRow | null> {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return (await readRows(now)).pages.find((r) => (p === r.path || (r.path !== '/' && p.startsWith(r.path + '/'))) && isActive(r, now)) ?? null;
}

/* Is this address on the allow-list (owner, 2026-11-08: testers may use a closed area)? */
export async function allowedIp(ip: string | null, now = Date.now()): Promise<boolean> {
  // Only when the host's address can be trusted (lib/clientIp.ts): otherwise a visitor could write an allow-listed address into X-Forwarded-For.
  const trusted = !!process.env.CLIENT_IP_HEADER?.trim() || Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10) > 0;
  return trusted && !!ip && (await readRows(now)).allowIps.includes(ip);
}

/* Planned closures whose banner time has come: shown as a notice on the public pages until they start. */
export async function upcomingMaintenance(now = Date.now()): Promise<{ label: string; startAt: number }[]> {
  const { rows, pages } = await readRows(now);
  const soon = (r: { enabled: boolean; startAt: number | null; bannerMinutes?: number }) =>
    r.enabled && r.startAt !== null && r.startAt > now && (r.bannerMinutes ?? 0) > 0 && r.startAt - now <= (r.bannerMinutes ?? 0) * 60_000;
  return [...rows.filter(soon).map((r) => ({ label: MODULES[r.key].label, startAt: r.startAt! })), ...pages.filter(soon).map((r) => ({ label: `The page ${r.path}`, startAt: r.startAt! }))].sort(
    (a, b) => a.startAt - b.startAt,
  );
}
