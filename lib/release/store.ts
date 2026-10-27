import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import type { EntitlementState } from './rules';

/* Buyer entitlements (migration 0061). Postgres when there, memory otherwise. Only lib/release/service.ts writes. */
export type Entitlement = {
  id: string;
  orderId: string;
  buyerId: string | null;
  productId: string | null;
  fileVersionId: string | null;
  deliveryFileId: string | null;
  licenceTier: string;
  licenceTextVersion: string;
  releaseApprovedBy: string | null;
  releaseApprovedAt: number;
  status: EntitlementState;
  statusReason: string | null;
  createdAt: number;
};
type Mem = { ents: Map<string, Entitlement> };
const mem: Mem = ((globalThis as { __entMem?: Mem }).__entMem ??= { ents: new Map() });

async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  const { error } = await createAdminClient().from('entitlements').select('id').limit(1);
  return !error;
}
const uuidOrNull = (id: string | null | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
const COLS = 'id, order_id, buyer_id, product_id, file_version_id, delivery_file_id, licence_tier, licence_text_version, release_approved_by, release_approved_at, status, status_reason, created_at';
const from = (r: Record<string, unknown>): Entitlement => ({
  id: r.id as string,
  orderId: r.order_id as string,
  buyerId: (r.buyer_id as string) ?? null,
  productId: (r.product_id as string) ?? null,
  fileVersionId: (r.file_version_id as string) ?? null,
  deliveryFileId: (r.delivery_file_id as string) ?? null,
  licenceTier: r.licence_tier as string,
  licenceTextVersion: r.licence_text_version as string,
  releaseApprovedBy: (r.release_approved_by as string) ?? null,
  releaseApprovedAt: Date.parse(r.release_approved_at as string),
  status: r.status as EntitlementState,
  statusReason: (r.status_reason as string) ?? null,
  createdAt: Date.parse(r.created_at as string),
});

export async function entitlementFor(orderId: string): Promise<Entitlement | null> {
  if (!(await pg())) return [...mem.ents.values()].find((e) => e.orderId === orderId) ?? null;
  const { data } = await createAdminClient().from('entitlements').select(COLS).eq('order_id', orderId).maybeSingle();
  return data ? from(data) : null;
}

/* One entitlement per order: creating it twice returns the first. */
export async function createEntitlement(e: Omit<Entitlement, 'id' | 'createdAt' | 'status' | 'statusReason'>): Promise<Entitlement> {
  const existing = await entitlementFor(e.orderId);
  if (existing) return existing;
  if (!(await pg())) {
    const rec: Entitlement = { ...e, id: crypto.randomUUID(), status: 'active', statusReason: null, createdAt: Date.now() };
    mem.ents.set(rec.id, rec);
    return rec;
  }
  const { data, error } = await createAdminClient()
    .from('entitlements')
    .insert({
      order_id: e.orderId,
      buyer_id: uuidOrNull(e.buyerId),
      product_id: e.productId,
      file_version_id: e.fileVersionId,
      delivery_file_id: e.deliveryFileId,
      licence_tier: e.licenceTier,
      licence_text_version: e.licenceTextVersion,
      release_approved_by: uuidOrNull(e.releaseApprovedBy),
      release_approved_at: new Date(e.releaseApprovedAt).toISOString(),
    })
    .select(COLS)
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return (await entitlementFor(e.orderId))!;
    throw new Error('Could not record the entitlement.');
  }
  return from(data!);
}

export async function setEntitlementStatus(prev: Entitlement, status: EntitlementState, reason: string, actorId: string | null): Promise<Entitlement> {
  if (prev.status === 'revoked') throw new Error('A revoked entitlement stays revoked.');
  if (!(await pg())) {
    const next = { ...prev, status, statusReason: reason };
    mem.ents.set(prev.id, next);
    return next;
  }
  const { data, error } = await createAdminClient()
    .from('entitlements')
    .update({ status, status_reason: reason, status_changed_by: uuidOrNull(actorId), status_changed_at: new Date().toISOString() })
    .eq('id', prev.id)
    .eq('status', prev.status)
    .select(COLS);
  if (error || !data?.length) throw new Error('The entitlement changed meanwhile. Reload.');
  return from(data[0]);
}
