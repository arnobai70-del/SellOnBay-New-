import 'server-only';
import type { NextResponse } from 'next/server';
import { adminOnly } from '../admin/guard';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { MAINTENANCE_LIMITS, MODULE_KEYS, isModuleKey, type ModuleKey } from './config';
import { fromModule, maintenanceJson } from './guard';
import { allowedIp, closedRow, forgetRows, fromDb, isActive, memoryAllow, memoryPages, memoryRows, readRows, type ModuleRow, type PageRow } from './state';

/*
 * The server side of module maintenance: the guard each important API route and server action calls (proxy.ts is only the first check),
 * the admin's changes (always audited; the database also keeps its own history), and the history for the Maintenance Manager.
 */

/* A signed-in admin who passed the authenticator code may still use a closed module to test it, except the admin dashboard itself. */
async function adminMayPass(key: ModuleKey): Promise<boolean> {
  if (key === 'admin') return false;
  try {
    // An address on the allow-list may use a closed area to test it (owner, 2026-11-08).
    const { headers } = await import('next/headers');
    const { clientAddress } = await import('../clientIp');
    if (await allowedIp(clientAddress(await headers()))) return true;
  } catch {
    // outside a request (tests, jobs): no address to check
  }
  const a = await adminOnly('super'); // testing a closed module is a Super Admin power
  return a.ok && a.id !== null; // demo mode has no real admin, so nobody passes there
}

/* Start of a route: `const closed = await maintenanceFor('checkout'); if (closed) return closed;` */
export async function maintenanceFor(key: ModuleKey, now = Date.now()): Promise<NextResponse | null> {
  // The whole site closes every module except the admin dashboard and sign-in (owner, 2026-11-08).
  const row = (await closedRow(key, now)) ?? (key === 'admin' || key === 'auth' ? null : await closedRow('site', now));
  if (!row || (await adminMayPass(row.key))) return null;
  return maintenanceJson(fromModule(row), now);
}

/* For a server action, which cannot send a status: the message to show, or null when the module is open. */
export async function maintenanceMessage(key: ModuleKey, now = Date.now()): Promise<string | null> {
  const r = await maintenanceFor(key, now);
  return r ? (((await r.json()) as { error: string }).error ?? 'Under maintenance.') : null;
}

export type ModuleState = ModuleRow & { active: boolean };
/* Every module, with its saved row (or the open default) and whether it is closed right now. */
export async function moduleStates(now = Date.now()): Promise<{ modules: ModuleState[]; source: 'db' | 'memory' }> {
  forgetRows();
  const { rows, source } = await readRows(now);
  const modules = MODULE_KEYS.map((key) => {
    const r = rows.find((x) => x.key === key) ?? { key, enabled: false, message: '', startAt: null, endAt: null, updatedBy: null, updatedAt: 0 };
    return { ...r, active: isActive(r, now) };
  });
  return { modules, source };
}

export type ModuleInput = { enabled: boolean; message: string; startAt: number | null; endAt: number | null; bannerMinutes?: number };
export type Result = { ok: true } | { ok: false; status: number; error: string };

export function inputProblem(v: ModuleInput): string | null {
  if (v.message.length > MAINTENANCE_LIMITS.message) return `Keep the message under ${MAINTENANCE_LIMITS.message} characters.`;
  if (/[<>]/.test(v.message)) return 'The message cannot contain < or >.';
  if (v.startAt !== null && v.endAt !== null && v.endAt <= v.startAt) return 'The end must be after the start.';
  if (v.bannerMinutes !== undefined && (!Number.isInteger(v.bannerMinutes) || v.bannerMinutes < 0 || v.bannerMinutes > 1440)) return 'The banner can show from 0 to 1,440 minutes before.';
  return null;
}

/* Turn a module's maintenance on or off, or plan it. Admins only (the route checks); audited. */
export async function setModule(adminId: string | null, key: string, input: ModuleInput, now = Date.now()): Promise<Result> {
  if (!isModuleKey(key)) return { ok: false, status: 400, error: 'Unknown module.' };
  const v = { ...input, message: input.message.trim() };
  const bad = inputProblem(v);
  if (bad) return { ok: false, status: 400, error: bad };
  if (v.enabled && v.endAt !== null && v.endAt <= now) return { ok: false, status: 400, error: 'The end time has already passed.' };
  const by = /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null;
  const before = (await moduleStates(now)).modules.find((m) => m.key === key)!;
  const { source } = await readRows(now);
  if (source === 'db') {
    const { error } = await createAdminClient()
      .from('module_maintenance')
      .upsert({
        module_key: key,
        enabled: v.enabled,
        message: v.message,
        start_at: v.startAt ? new Date(v.startAt).toISOString() : null,
        end_at: v.endAt ? new Date(v.endAt).toISOString() : null,
        updated_by: by,
        updated_at: new Date(now).toISOString(),
        ...(v.bannerMinutes !== undefined ? { banner_minutes: v.bannerMinutes } : {}),
      });
    if (error) return { ok: false, status: 500, error: 'Could not save. Nothing was changed.' };
  } else {
    memoryRows.set(key, { key, ...v, updatedBy: by, updatedAt: now });
    memHistory.unshift({ key, ...v, updatedBy: by, updatedAt: now });
  }
  forgetRows();
  await audit(adminId, v.enabled ? 'maintenance_on' : 'maintenance_off', 'module', key, {
    from: { enabled: before.enabled, startAt: before.startAt, endAt: before.endAt },
    to: { enabled: v.enabled, startAt: v.startAt, endAt: v.endAt },
    message: v.message.slice(0, 120),
  });
  return { ok: true };
}

const memHistory: ModuleRow[] = ((globalThis as { __maintHistory?: ModuleRow[] }).__maintHistory ??= []);

/* The last changes, newest first. */
export async function maintenanceHistory(limit = 50): Promise<ModuleRow[]> {
  if ((await readRows()).source === 'memory') return memHistory.slice(0, limit);
  const { data } = await createAdminClient()
    .from('module_maintenance_history')
    .select('module_key, enabled, message, start_at, end_at, updated_by, changed_at')
    .order('changed_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => fromDb({ ...r, updated_at: r.changed_at })).filter((r): r is ModuleRow => !!r);
}

/* ---------- single pages and the allow-list (owner, 2026-11-08; migration 0082) ---------- */

export const PAGE_PATH = /^\/[A-Za-z0-9/_.-]{0,199}$/;
/* Pages that can never be closed one by one: the way back (admin, sign-in, the maintenance page) and the money routes. */
const NEVER_CLOSE = /^\/(admin|dashboard\/admin|signin|two-factor|auth|maintenance|api)(\/|$)/;
export function pageProblem(path: string): string | null {
  if (!PAGE_PATH.test(path) || path.includes('..') || path.includes('//')) return 'Write the page address, starting with /, for example /domains.';
  if (path === '/') return 'To close the home page, close the whole site instead.';
  if (NEVER_CLOSE.test(path)) return 'This address keeps working so the site can always be opened again.';
  return null;
}

export async function pageStates(now = Date.now()): Promise<(PageRow & { active: boolean })[]> {
  forgetRows();
  return (await readRows(now)).pages.map((r) => ({ ...r, active: isActive(r, now) })).sort((a, b) => a.path.localeCompare(b.path));
}

export async function setPage(adminId: string | null, rawPath: string, input: ModuleInput | null, now = Date.now()): Promise<Result> {
  const path = rawPath.trim().replace(/\/+$/, '') || '/';
  const bad = pageProblem(path);
  if (bad) return { ok: false, status: 400, error: bad };
  const by = /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null;
  const { source } = await readRows(now);
  if (input === null) {
    if (source === 'db') {
      const { error } = await createAdminClient().from('page_maintenance').delete().eq('path', path);
      if (error) return { ok: false, status: 500, error: 'Could not remove. Nothing was changed.' };
    } else memoryPages.delete(path);
    forgetRows();
    await audit(adminId, 'maintenance_page_removed', 'page', path, {});
    return { ok: true };
  }
  const v = { ...input, message: input.message.trim(), bannerMinutes: input.bannerMinutes ?? 0 };
  const problem = inputProblem(v);
  if (problem) return { ok: false, status: 400, error: problem };
  if (v.enabled && v.endAt !== null && v.endAt <= now) return { ok: false, status: 400, error: 'The end time has already passed.' };
  if (source === 'db') {
    const { error } = await createAdminClient()
      .from('page_maintenance')
      .upsert({
        path,
        enabled: v.enabled,
        message: v.message,
        start_at: v.startAt ? new Date(v.startAt).toISOString() : null,
        end_at: v.endAt ? new Date(v.endAt).toISOString() : null,
        banner_minutes: v.bannerMinutes,
        updated_by: by,
        updated_at: new Date(now).toISOString(),
      });
    if (error) return { ok: false, status: 500, error: 'Could not save. Nothing was changed.' };
  } else memoryPages.set(path, { path, ...v, updatedBy: by, updatedAt: now });
  forgetRows();
  await audit(adminId, v.enabled ? 'maintenance_page_on' : 'maintenance_page_off', 'page', path, { startAt: v.startAt, endAt: v.endAt, message: v.message.slice(0, 120) });
  return { ok: true };
}

/* Addresses that may use a closed area to test it. Plain addresses, at most 20; audited. */
export function ipsProblem(ips: string[]): string | null {
  if (ips.length > 20) return 'At most 20 addresses.';
  const ok = (ip: string) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ? ip.split('.').every((n) => Number(n) <= 255) : /^[0-9a-f:]{2,39}$/i.test(ip) && ip.includes(':'));
  return ips.every(ok) ? null : 'Write each address as a plain IPv4 or IPv6 address.';
}
export async function setAllowIps(adminId: string | null, ips: string[]): Promise<Result> {
  const list = [...new Set(ips.map((x) => x.trim()).filter(Boolean))];
  const bad = ipsProblem(list);
  if (bad) return { ok: false, status: 400, error: bad };
  const { source } = await readRows();
  if (source === 'db') {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: 'maintenance:allow_ips', value: list, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save. Nothing was changed.' };
  } else memoryAllow(list);
  forgetRows();
  await audit(adminId, 'maintenance_allow_list_changed', 'settings', 'maintenance:allow_ips', { count: list.length });
  return { ok: true };
}
