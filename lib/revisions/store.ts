import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import type { BuyerHint, PolicyInput, RevisionKind, RevisionState } from './rules';

/* Revision policies, revisions and their log (migration 0064). Postgres when there, memory otherwise. Only lib/revisions/service.ts writes. */
export type PolicyState = 'proposed' | 'approved' | 'rejected' | 'superseded';
export type Policy = PolicyInput & {
  id: string;
  productId: string;
  version: number;
  status: PolicyState;
  proposedBy: string | null;
  decidedBy: string | null;
  decidedAt: number | null;
  decisionReason: string;
  createdAt: number;
};
export type Revision = {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string | null;
  description: string;
  hint: BuyerHint;
  kind: RevisionKind | null;
  status: RevisionState;
  countsAllowance: boolean;
  decisionNote: string;
  requestId: string | null;
  fileId: string | null;
  deliveryNote: string;
  submittedForReleaseAt: number | null;
  releaseDueAt: number | null;
  releasedAt: number | null;
  releasedBy: string | null;
  followsId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type RevisionEvent = { revisionId: string; actorId: string | null; event: string; from: RevisionState | null; to: RevisionState | null; note?: string; at: number };

type Mem = { policies: Map<string, Policy>; revisions: Map<string, Revision>; events: RevisionEvent[] };
const mem: Mem = ((globalThis as { __revMem?: Mem }).__revMem ??= { policies: new Map(), revisions: new Map(), events: [] });

async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  const { error } = await createAdminClient().from('revisions').select('id').limit(1);
  return !error;
}
const uuidOrNull = (id: string | null | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
const iso = (n: number | null | undefined) => (n === null || n === undefined ? null : new Date(n).toISOString());
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null);
type Row = Record<string, unknown>;

const pFrom = (r: Row): Policy => ({
  id: r.id as string,
  productId: r.product_id as string,
  version: r.version as number,
  included: r.included as number,
  windowDays: r.window_days as number,
  scope: (r.scope as string) ?? '',
  extraPriceCents: (r.extra_price_cents as number | null) ?? null,
  supportTerms: (r.support_terms as string) ?? '',
  status: r.status as PolicyState,
  proposedBy: (r.proposed_by as string) ?? null,
  decidedBy: (r.decided_by as string) ?? null,
  decidedAt: ms(r.decided_at),
  decisionReason: (r.decision_reason as string) ?? '',
  createdAt: ms(r.created_at) ?? 0,
});
const rFrom = (r: Row): Revision => ({
  id: r.id as string,
  orderId: r.order_id as string,
  buyerId: r.buyer_id as string,
  sellerId: (r.seller_id as string) ?? null,
  description: r.description as string,
  hint: r.buyer_hint as BuyerHint,
  kind: (r.kind as RevisionKind) ?? null,
  status: r.status as RevisionState,
  countsAllowance: !!r.counts_allowance,
  decisionNote: (r.decision_note as string) ?? '',
  requestId: (r.request_id as string) ?? null,
  fileId: (r.file_id as string) ?? null,
  deliveryNote: (r.delivery_note as string) ?? '',
  submittedForReleaseAt: ms(r.submitted_for_release_at),
  releaseDueAt: ms(r.release_due_at),
  releasedAt: ms(r.released_at),
  releasedBy: (r.released_by as string) ?? null,
  followsId: (r.follows_id as string) ?? null,
  createdAt: ms(r.created_at) ?? 0,
  updatedAt: ms(r.updated_at) ?? 0,
});
const pRow = (p: Policy) => ({
  id: p.id,
  product_id: p.productId,
  version: p.version,
  included: p.included,
  window_days: p.windowDays,
  scope: p.scope,
  extra_price_cents: p.extraPriceCents,
  support_terms: p.supportTerms,
  status: p.status,
  proposed_by: uuidOrNull(p.proposedBy),
  decided_by: uuidOrNull(p.decidedBy),
  decided_at: iso(p.decidedAt),
  decision_reason: p.decisionReason,
});
const rRow = (r: Revision) => ({
  id: r.id,
  order_id: r.orderId,
  buyer_id: r.buyerId,
  seller_id: uuidOrNull(r.sellerId),
  description: r.description,
  buyer_hint: r.hint,
  kind: r.kind,
  status: r.status,
  counts_allowance: r.countsAllowance,
  decision_note: r.decisionNote,
  request_id: r.requestId,
  file_id: r.fileId,
  delivery_note: r.deliveryNote,
  submitted_for_release_at: iso(r.submittedForReleaseAt),
  release_due_at: iso(r.releaseDueAt),
  released_at: iso(r.releasedAt),
  released_by: uuidOrNull(r.releasedBy),
  follows_id: r.followsId,
  updated_at: iso(r.updatedAt),
});

/* ---------- policies ---------- */
export async function policiesOf(productId: string): Promise<Policy[]> {
  if (!(await pg())) return [...mem.policies.values()].filter((p) => p.productId === productId).sort((a, b) => b.version - a.version);
  const { data } = await createAdminClient().from('revision_policies').select('*').eq('product_id', productId).order('version', { ascending: false });
  return (data ?? []).map(pFrom);
}
export async function policyById(id: string): Promise<Policy | null> {
  if (!(await pg())) return mem.policies.get(id) ?? null;
  const { data } = await createAdminClient().from('revision_policies').select('*').eq('id', id).maybeSingle();
  return data ? pFrom(data) : null;
}
export async function proposedPolicies(): Promise<Policy[]> {
  if (!(await pg())) return [...mem.policies.values()].filter((p) => p.status === 'proposed').sort((a, b) => a.createdAt - b.createdAt);
  const { data } = await createAdminClient().from('revision_policies').select('*').eq('status', 'proposed').order('created_at').limit(200);
  return (data ?? []).map(pFrom);
}
export async function putPolicy(p: Policy, insert: boolean): Promise<void> {
  if (!(await pg())) return void mem.policies.set(p.id, p);
  const db = createAdminClient().from('revision_policies');
  const { error } = insert ? await db.insert({ ...pRow(p), created_at: iso(p.createdAt) }) : await db.update(pRow(p)).eq('id', p.id);
  if (error) throw new Error('Could not save the revision policy.');
}

/* ---------- revisions ---------- */
export async function revisionById(id: string): Promise<Revision | null> {
  if (!(await pg())) return mem.revisions.get(id) ?? null;
  const { data } = await createAdminClient().from('revisions').select('*').eq('id', id).maybeSingle();
  return data ? rFrom(data) : null;
}
export async function revisionsFor(f: { orderId?: string; sellerId?: string; buyerId?: string; statuses?: RevisionState[] }): Promise<Revision[]> {
  if (!(await pg()))
    return [...mem.revisions.values()]
      .filter((r) => (!f.orderId || r.orderId === f.orderId) && (!f.sellerId || r.sellerId === f.sellerId) && (!f.buyerId || r.buyerId === f.buyerId) && (!f.statuses || f.statuses.includes(r.status)))
      .sort((a, b) => a.createdAt - b.createdAt);
  let q = createAdminClient().from('revisions').select('*').order('created_at').limit(500);
  if (f.orderId) q = q.eq('order_id', f.orderId);
  if (f.sellerId) q = q.eq('seller_id', f.sellerId);
  if (f.buyerId) q = q.eq('buyer_id', f.buyerId);
  if (f.statuses) q = q.in('status', f.statuses);
  const { data } = await q;
  return (data ?? []).map(rFrom);
}
/* Saves a revision only if it is still in the state the caller saw, and logs the step. */
export async function putRevision(next: Revision, prevStatus: RevisionState | null, ev: Omit<RevisionEvent, 'revisionId'>): Promise<Revision> {
  if (!(await pg())) {
    const cur = mem.revisions.get(next.id);
    if (prevStatus === null ? cur : cur?.status !== prevStatus) throw new Error('The revision changed meanwhile. Reload and try again.');
    mem.revisions.set(next.id, next);
    mem.events.push({ ...ev, revisionId: next.id });
    return next;
  }
  const db = createAdminClient();
  if (prevStatus === null) {
    const { error } = await db.from('revisions').insert({ ...rRow(next), created_at: iso(next.createdAt) });
    if (error) throw new Error(/revisions_one_open/.test(error.message) ? 'This order already has an open revision.' : 'Could not save the revision.');
  } else {
    const { data, error } = await db.from('revisions').update(rRow(next)).eq('id', next.id).eq('status', prevStatus).select('id');
    if (error) throw new Error('Could not save the revision.');
    if (!data?.length) throw new Error('The revision changed meanwhile. Reload and try again.');
  }
  const { error } = await db
    .from('revision_events')
    .insert({ revision_id: next.id, actor_id: uuidOrNull(ev.actorId), event: ev.event, from_status: ev.from, to_status: ev.to, note: ev.note ?? null, created_at: iso(ev.at) });
  if (error) throw new Error('Could not log the revision.');
  return next;
}
export async function revisionEvents(id: string): Promise<RevisionEvent[]> {
  if (!(await pg())) return mem.events.filter((e) => e.revisionId === id);
  const { data } = await createAdminClient().from('revision_events').select('actor_id, event, from_status, to_status, note, created_at').eq('revision_id', id).order('id');
  return (data ?? []).map((r) => ({ revisionId: id, actorId: r.actor_id, event: r.event, from: r.from_status, to: r.to_status, note: r.note ?? undefined, at: Date.parse(r.created_at) }));
}
