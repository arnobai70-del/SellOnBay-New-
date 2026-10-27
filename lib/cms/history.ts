import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAdminClient } from '../supabase/server';
import { nextRevision, trackedKey, type Revision } from './rules';

/*
 * The CMS history store (migration 0063, content_revisions). Postgres when the table is there, memory otherwise.
 * Written only by the setters in lib/site/contentStore.ts and lib/seo/*Store.ts after a successful save, and by lib/cms/restore.ts.
 * A history write that fails never undoes the save it describes: the audit log (written by the same setter) still has it.
 */
/* Set by lib/cms/restore.ts while a rollback runs the setter, so the setter's own record says "rollback from vN". */
export const rollbackContext = new AsyncLocalStorage<{ key: string; fromVersion: number }>();

const g = globalThis as { __cmsHist?: Revision[]; __cmsPg?: boolean };
const mem = (g.__cmsHist ??= []);

async function pg(): Promise<boolean> {
  if (g.__cmsPg !== undefined) return g.__cmsPg;
  try {
    const { error } = await createAdminClient().from('content_revisions').select('id').limit(1);
    g.__cmsPg = !error;
  } catch {
    g.__cmsPg = false;
  }
  return g.__cmsPg;
}
const uuidOrNull = (id: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
const fromRow = (r: Record<string, unknown>): Revision => ({
  id: r.id as string,
  key: r.key as string,
  version: r.version as number,
  value: r.value ?? null,
  action: r.action as Revision['action'],
  fromVersion: (r.from_version as number | null) ?? null,
  changedBy: (r.changed_by as string | null) ?? null,
  at: Date.parse(r.created_at as string),
});

export async function revisionsOf(key: string, limit = 50): Promise<Revision[]> {
  if (!trackedKey(key)) return [];
  if (!(await pg()))
    return mem
      .filter((r) => r.key === key)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit);
  const { data } = await createAdminClient().from('content_revisions').select('*').eq('key', key).order('version', { ascending: false }).limit(limit);
  return (data ?? []).map(fromRow);
}

export async function revision(key: string, version: number): Promise<Revision | null> {
  if (!(await pg())) return mem.find((r) => r.key === key && r.version === version) ?? null;
  const { data } = await createAdminClient().from('content_revisions').select('*').eq('key', key).eq('version', version).maybeSingle();
  return data ? fromRow(data) : null;
}

/* Keys with history, newest change first (for the admin list). */
export async function changedKeys(limit = 200): Promise<{ key: string; version: number; at: number }[]> {
  const rows: Revision[] = (await pg()) ? ((await createAdminClient().from('content_revisions').select('*').order('created_at', { ascending: false }).limit(2000)).data ?? []).map(fromRow) : [...mem];
  const latest = new Map<string, { key: string; version: number; at: number }>();
  for (const r of rows) {
    const cur = latest.get(r.key);
    if (!cur || r.version > cur.version) latest.set(r.key, { key: r.key, version: r.version, at: r.at });
  }
  return [...latest.values()].sort((a, b) => b.at - a.at).slice(0, limit);
}

async function insert(rec: Revision): Promise<boolean> {
  if (!(await pg())) {
    mem.push(rec);
    return true;
  }
  const { error } = await createAdminClient()
    .from('content_revisions')
    .insert({
      id: rec.id,
      key: rec.key,
      version: rec.version,
      value: rec.value,
      action: rec.action,
      from_version: rec.fromVersion,
      changed_by: uuidOrNull(rec.changedBy),
      created_at: new Date(rec.at).toISOString(),
    });
  return !error;
}

/*
 * Records what a key now holds. Called after the setting is saved, with what it held before: the first time a key is saved, that earlier state
 * (null = the built-in version) becomes revision 1, so an admin can always roll back to how the page was before the history began.
 */
export async function recordRevision(adminId: string | null, key: string, value: unknown, before?: unknown): Promise<Revision | null> {
  if (!trackedKey(key)) return null;
  const ctx = rollbackContext.getStore();
  const fromVersion = ctx?.key === key ? ctx.fromVersion : undefined;
  const action = fromVersion ? 'rollback' : 'save';
  try {
    let history = await revisionsOf(key, 1000);
    if (!history.length && before !== undefined) {
      const base: Revision = { id: crypto.randomUUID(), key, version: 1, value: before ?? null, action: 'save', fromVersion: null, changedBy: null, at: Date.now() - 1 };
      if (await insert(base)) history = [base];
    }
    const n = nextRevision(history, { key, value, action, fromVersion });
    if (!n.ok) return null;
    const rec: Revision = { id: crypto.randomUUID(), key, version: n.version, value: value ?? null, action, fromVersion: fromVersion ?? null, changedBy: adminId, at: Date.now() };
    return (await insert(rec)) ? rec : null;
  } catch {
    return null;
  }
}
