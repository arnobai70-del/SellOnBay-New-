import 'server-only';
import { createAdminClient } from '../supabase/server';
import { auditStrict } from './audit';
import { checkScopeChange, effectiveScopes, type AdminScope } from './scopes';

/*
 * A Super Admin gives an admin account its permissions (D-H). The change is audited before it is saved (auditStrict), a Super Admin cannot change
 * their own permissions, and the shop always keeps at least one Super Admin.
 */
export type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

/* Admin accounts and their permissions, or null when the column is not there yet (migration 0055). */
export async function adminScopeList(): Promise<Map<string, AdminScope[]> | null> {
  const { data, error } = await createAdminClient().from('profiles').select('id, admin_scopes').eq('role', 'admin');
  if (error) return null;
  return new Map((data ?? []).map((r) => [r.id as string, effectiveScopes(r.admin_scopes as string[] | null)]));
}

export async function setAdminScopes(actorId: string | null, userId: string, wanted: string[], reason: string): Promise<Result> {
  const why = reason.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the reason under 500 characters.');
  if (!actorId) return fail(403, 'Only a signed-in Super Admin can change permissions.');
  if (actorId === userId) return fail(400, 'You cannot change your own permissions. Ask another Super Admin.');
  const c = checkScopeChange(wanted);
  if (!c.ok) return fail(400, c.error);
  const all = await adminScopeList();
  if (!all) return fail(409, 'Admin permissions need database migration 0055 first.');
  const before = all.get(userId);
  if (!before) return fail(404, 'That account is not an admin.');
  const supersAfter = [...all].filter(([id, s]) => (id === userId ? c.scopes : s).includes('super')).length;
  if (supersAfter < 1) return fail(409, 'The shop must keep at least one Super Admin.');
  if (before.length === c.scopes.length && before.every((s) => c.scopes.includes(s))) return fail(409, 'Those are already the permissions.');
  await auditStrict(actorId, 'admin_scopes_changed', 'profile', userId, { reason: why, from: before, to: c.scopes });
  const { error } = await createAdminClient().from('profiles').update({ admin_scopes: c.scopes }).eq('id', userId).eq('role', 'admin');
  if (error) return fail(500, 'Could not save the permissions.');
  return { ok: true };
}
