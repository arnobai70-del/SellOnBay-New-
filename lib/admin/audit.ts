import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';

/* Every admin action is written down: who, what, on what, and the details. The table cannot be edited or emptied. */
export type AuditEntry = { id: number; adminId: string | null; action: string; targetType: string; targetRef: string; detail: Record<string, unknown>; at: number };

const mem: AuditEntry[] = ((globalThis as { __auditMem?: AuditEntry[] }).__auditMem ??= []);
let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('audit_log').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

/* Detail never holds a password, key or card detail. Keep it to ids, states and short notes. */
export async function audit(adminId: string | null, action: string, targetType: string, targetRef: string, detail: Record<string, unknown> = {}): Promise<void> {
  const uuid = /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null;
  if (await pg()) {
    const { error } = await createAdminClient().from('audit_log').insert({ admin_id: uuid, action, target_type: targetType, target_ref: targetRef, detail });
    if (error) console.error('audit log failed', error.message);
    return;
  }
  mem.push({ id: mem.length + 1, adminId, action, targetType, targetRef, detail, at: Date.now() });
}

export async function auditList(limit = 100, filter?: { targetType?: string; targetRef?: string }): Promise<AuditEntry[]> {
  if (await pg()) {
    let q = createAdminClient().from('audit_log').select('id, admin_id, action, target_type, target_ref, detail, created_at').order('id', { ascending: false }).limit(limit);
    if (filter?.targetType) q = q.eq('target_type', filter.targetType);
    if (filter?.targetRef) q = q.eq('target_ref', filter.targetRef);
    const { data } = await q;
    return (data ?? []).map((r) => ({ id: r.id, adminId: r.admin_id, action: r.action, targetType: r.target_type, targetRef: r.target_ref, detail: r.detail ?? {}, at: Date.parse(r.created_at) }));
  }
  return mem
    .filter((e) => (!filter?.targetType || e.targetType === filter.targetType) && (!filter?.targetRef || e.targetRef === filter.targetRef))
    .slice()
    .reverse()
    .slice(0, limit);
}
