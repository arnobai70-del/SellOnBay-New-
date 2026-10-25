import 'server-only';
import type { NextResponse } from 'next/server';
import { adminOnly } from '../admin/guard';
import { audit } from '../admin/audit';
import { createAdminClient } from '../supabase/server';
import { MAINTENANCE_LIMITS, MODULE_KEYS, isModuleKey, type ModuleKey } from './config';
import { maintenanceJson } from './guard';
import { closedRow, forgetRows, fromDb, isActive, memoryRows, readRows, type ModuleRow } from './state';

/*
 * The server side of module maintenance: the guard each important API route and server action calls (proxy.ts is only the first check),
 * the admin's changes (always audited; the database also keeps its own history), and the history for the Maintenance Manager.
 */

/* A signed-in admin who passed the authenticator code may still use a closed module to test it, except the admin dashboard itself. */
async function adminMayPass(key: ModuleKey): Promise<boolean> {
  if (key === 'admin') return false;
  const a = await adminOnly();
  return a.ok && a.id !== null; // demo mode has no real admin, so nobody passes there
}

/* Start of a route: `const closed = await maintenanceFor('checkout'); if (closed) return closed;` */
export async function maintenanceFor(key: ModuleKey, now = Date.now()): Promise<NextResponse | null> {
  const row = await closedRow(key, now);
  if (!row || (await adminMayPass(key))) return null;
  return maintenanceJson(row, now);
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

export type ModuleInput = { enabled: boolean; message: string; startAt: number | null; endAt: number | null };
export type Result = { ok: true } | { ok: false; status: number; error: string };

export function inputProblem(v: ModuleInput): string | null {
  if (v.message.length > MAINTENANCE_LIMITS.message) return `Keep the message under ${MAINTENANCE_LIMITS.message} characters.`;
  if (/[<>]/.test(v.message)) return 'The message cannot contain < or >.';
  if (v.startAt !== null && v.endAt !== null && v.endAt <= v.startAt) return 'The end must be after the start.';
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
