import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import type { MethodKind } from './rules';

/* Payment methods, payment attempts, refunds and their log (migration 0060). Postgres when there, memory otherwise. Only lib/payments writes. */
export type PaymentMethod = { id: string; kind: MethodKind; label: string; instructions: string; currency: string; active: boolean; createdAt: number; updatedAt: number };
export type AttemptState = 'submitted' | 'reconciled' | 'rejected' | 'expired' | 'gateway_pending' | 'confirmed' | 'failed';
export type Attempt = {
  id: string;
  orderId: string;
  kind: 'manual' | 'gateway';
  methodId: string | null;
  provider: string | null;
  reference: string;
  referenceKey: string;
  amountClaimedCents: number;
  currency: string;
  paidOn: string | null;
  proofPath: string | null;
  status: AttemptState;
  amountReceivedCents: number | null;
  statementRef: string | null;
  receivedAt: number | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
};
export type RefundState = 'requested' | 'approved' | 'paid' | 'cancelled';
export type Refund = {
  id: string;
  orderId: string;
  attemptId: string | null;
  kind: 'overpayment' | 'order' | 'partial';
  amountCents: number;
  reason: string;
  status: RefundState;
  requestedBy: string | null;
  approvedBy: string | null;
  paidMethod: string | null;
  paidRef: string | null;
  paidAt: number | null;
  createdAt: number;
};
export type PayEvent = { attemptId?: string | null; refundId?: string | null; orderId: string; actorId: string | null; event: string; detail: Record<string, unknown>; at: number };

type Mem = { methods: Map<string, PaymentMethod>; attempts: Map<string, Attempt>; refunds: Map<string, Refund>; events: PayEvent[]; proofs: Map<string, Uint8Array> };
const mem: Mem = ((globalThis as { __payMem?: Mem }).__payMem ??= { methods: new Map(), attempts: new Map(), refunds: new Map(), events: [], proofs: new Map() });

let ready: { ok: boolean; at: number } | undefined;
export async function paymentsPg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('payment_attempts').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}
const iso = (v: number | null | undefined) => (typeof v === 'number' ? new Date(v).toISOString() : null);
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null);
const uuidOrNull = (id: string | null | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
type Row = Record<string, unknown>;

/* ---------- methods ---------- */
const mFrom = (r: Row): PaymentMethod => ({
  id: r.id as string,
  kind: r.kind as MethodKind,
  label: r.label as string,
  instructions: r.instructions as string,
  currency: r.currency as string,
  active: !!r.active,
  createdAt: ms(r.created_at) ?? 0,
  updatedAt: ms(r.updated_at) ?? 0,
});
export async function listMethods(activeOnly = false): Promise<PaymentMethod[]> {
  if (!(await paymentsPg())) return [...mem.methods.values()].filter((m) => !activeOnly || m.active);
  let q = createAdminClient().from('payment_methods').select('id, kind, label, instructions, currency, active, created_at, updated_at').order('created_at');
  if (activeOnly) q = q.eq('active', true);
  const { data } = await q;
  return (data ?? []).map(mFrom);
}
export async function getMethod(id: string): Promise<PaymentMethod | null> {
  return (await listMethods()).find((m) => m.id === id) ?? null;
}
export async function saveMethod(m: Omit<PaymentMethod, 'createdAt' | 'updatedAt'>, actorId: string | null, isNew: boolean): Promise<PaymentMethod> {
  const now = Date.now();
  if (!(await paymentsPg())) {
    const rec = { ...m, createdAt: mem.methods.get(m.id)?.createdAt ?? now, updatedAt: now };
    mem.methods.set(m.id, rec);
    return rec;
  }
  const row = { kind: m.kind, label: m.label, instructions: m.instructions, currency: m.currency, active: m.active, updated_at: iso(now) };
  const db = createAdminClient().from('payment_methods');
  const { data, error } = isNew
    ? await db
        .insert({ id: m.id, ...row, created_by: uuidOrNull(actorId) })
        .select('id, kind, label, instructions, currency, active, created_at, updated_at')
        .single()
    : await db.update(row).eq('id', m.id).select('id, kind, label, instructions, currency, active, created_at, updated_at').single();
  if (error || !data) throw new Error('Could not save the payment method.');
  return mFrom(data);
}

/* ---------- attempts ---------- */
const A_COLS =
  'id, order_id, kind, method_id, provider, reference, reference_key, amount_claimed_cents, currency, paid_on, proof_path, status, amount_received_cents, statement_ref, received_at, reviewed_by, review_note, created_by, created_at, updated_at';
const aFrom = (r: Row): Attempt => ({
  id: r.id as string,
  orderId: r.order_id as string,
  kind: r.kind as 'manual' | 'gateway',
  methodId: (r.method_id as string) ?? null,
  provider: (r.provider as string) ?? null,
  reference: r.reference as string,
  referenceKey: r.reference_key as string,
  amountClaimedCents: r.amount_claimed_cents as number,
  currency: r.currency as string,
  paidOn: (r.paid_on as string) ?? null,
  proofPath: (r.proof_path as string) ?? null,
  status: r.status as AttemptState,
  amountReceivedCents: (r.amount_received_cents as number) ?? null,
  statementRef: (r.statement_ref as string) ?? null,
  receivedAt: ms(r.received_at),
  reviewedBy: (r.reviewed_by as string) ?? null,
  reviewNote: (r.review_note as string) ?? null,
  createdBy: (r.created_by as string) ?? null,
  createdAt: ms(r.created_at) ?? 0,
  updatedAt: ms(r.updated_at) ?? 0,
});

export class DuplicateReference extends Error {}
export async function insertAttempt(a: Omit<Attempt, 'createdAt' | 'updatedAt'>): Promise<Attempt> {
  const now = Date.now();
  if (!(await paymentsPg())) {
    const dup = [...mem.attempts.values()].some((x) => x.status !== 'rejected' && (x.methodId ?? x.provider) === (a.methodId ?? a.provider) && x.referenceKey === a.referenceKey);
    if (dup) throw new DuplicateReference('This payment reference was already used.');
    const rec = { ...a, createdAt: now, updatedAt: now };
    mem.attempts.set(a.id, rec);
    return rec;
  }
  const { data, error } = await createAdminClient()
    .from('payment_attempts')
    .insert({
      id: a.id,
      order_id: a.orderId,
      kind: a.kind,
      method_id: a.methodId,
      provider: a.provider,
      reference: a.reference,
      reference_key: a.referenceKey,
      amount_claimed_cents: a.amountClaimedCents,
      currency: a.currency,
      paid_on: a.paidOn,
      proof_path: a.proofPath,
      status: a.status,
      created_by: uuidOrNull(a.createdBy),
    })
    .select(A_COLS)
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new DuplicateReference('This payment reference was already used.');
    throw new Error('Could not record the payment.');
  }
  return aFrom(data!);
}
export async function getAttempt(id: string): Promise<Attempt | null> {
  if (!(await paymentsPg())) return mem.attempts.get(id) ?? null;
  const { data } = await createAdminClient().from('payment_attempts').select(A_COLS).eq('id', id).maybeSingle();
  return data ? aFrom(data) : null;
}
export async function attemptsFor(orderId: string): Promise<Attempt[]> {
  if (!(await paymentsPg())) return [...mem.attempts.values()].filter((a) => a.orderId === orderId).sort((a, b) => a.createdAt - b.createdAt);
  const { data } = await createAdminClient().from('payment_attempts').select(A_COLS).eq('order_id', orderId).order('created_at');
  return (data ?? []).map(aFrom);
}
export async function listAttempts(statuses: AttemptState[]): Promise<Attempt[]> {
  if (!(await paymentsPg())) return [...mem.attempts.values()].filter((a) => statuses.includes(a.status)).sort((a, b) => a.createdAt - b.createdAt);
  const { data } = await createAdminClient().from('payment_attempts').select(A_COLS).in('status', statuses).order('created_at').limit(500);
  return (data ?? []).map(aFrom);
}
export async function decideAttempt(
  prev: Attempt,
  patch: Pick<Attempt, 'status'> & Partial<Pick<Attempt, 'amountReceivedCents' | 'statementRef' | 'receivedAt' | 'reviewedBy' | 'reviewNote'>>,
): Promise<Attempt> {
  const now = Date.now();
  if (!(await paymentsPg())) {
    const cur = mem.attempts.get(prev.id);
    if (!cur || cur.status !== prev.status) throw new Error('This payment was already decided. Reload.');
    const next = { ...cur, ...patch, updatedAt: now };
    mem.attempts.set(prev.id, next);
    return next;
  }
  const { data, error } = await createAdminClient()
    .from('payment_attempts')
    .update({
      status: patch.status,
      amount_received_cents: patch.amountReceivedCents ?? null,
      statement_ref: patch.statementRef ?? null,
      received_at: iso(patch.receivedAt),
      reviewed_by: uuidOrNull(patch.reviewedBy),
      reviewed_at: iso(now),
      review_note: patch.reviewNote ?? null,
      updated_at: iso(now),
    })
    .eq('id', prev.id)
    .eq('status', prev.status)
    .select(A_COLS);
  if (error) throw new Error('Could not save the decision.');
  if (!data?.length) throw new Error('This payment was already decided. Reload.');
  return aFrom(data[0]);
}

/* ---------- proofs (private) ---------- */
export async function putProof(path: string, bytes: Uint8Array, type: string): Promise<void> {
  if (!(await paymentsPg())) return void mem.proofs.set(path, bytes);
  const { error } = await createAdminClient().storage.from('payment-proofs').upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error('Could not store the proof.');
}
export async function proofUrl(path: string): Promise<string | null> {
  if (!(await paymentsPg())) return mem.proofs.has(path) ? `memory://payment-proofs/${path}` : null;
  const { data } = await createAdminClient().storage.from('payment-proofs').createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

/* ---------- refunds ---------- */
const R_COLS = 'id, order_id, attempt_id, kind, amount_cents, reason, status, requested_by, approved_by, paid_method, paid_ref, paid_at, created_at';
const rFrom = (r: Row): Refund => ({
  id: r.id as string,
  orderId: r.order_id as string,
  attemptId: (r.attempt_id as string) ?? null,
  kind: r.kind as Refund['kind'],
  amountCents: r.amount_cents as number,
  reason: r.reason as string,
  status: r.status as RefundState,
  requestedBy: (r.requested_by as string) ?? null,
  approvedBy: (r.approved_by as string) ?? null,
  paidMethod: (r.paid_method as string) ?? null,
  paidRef: (r.paid_ref as string) ?? null,
  paidAt: ms(r.paid_at),
  createdAt: ms(r.created_at) ?? 0,
});
export async function insertRefund(r: Omit<Refund, 'createdAt'>): Promise<Refund> {
  const now = Date.now();
  if (!(await paymentsPg())) {
    if (r.kind === 'overpayment' && r.attemptId && [...mem.refunds.values()].some((x) => x.kind === 'overpayment' && x.attemptId === r.attemptId)) throw new Error('already recorded');
    const rec = { ...r, createdAt: now };
    mem.refunds.set(r.id, rec);
    return rec;
  }
  const { data, error } = await createAdminClient()
    .from('refunds')
    .insert({ id: r.id, order_id: r.orderId, attempt_id: r.attemptId, kind: r.kind, amount_cents: r.amountCents, reason: r.reason, status: r.status, requested_by: uuidOrNull(r.requestedBy) })
    .select(R_COLS)
    .single();
  if (error || !data) throw new Error(/unique|duplicate/i.test(error?.message ?? '') ? 'already recorded' : 'Could not record the refund.');
  return rFrom(data);
}
export async function getRefund(id: string): Promise<Refund | null> {
  if (!(await paymentsPg())) return mem.refunds.get(id) ?? null;
  const { data } = await createAdminClient().from('refunds').select(R_COLS).eq('id', id).maybeSingle();
  return data ? rFrom(data) : null;
}
export async function listRefunds(f: { statuses?: RefundState[]; orderId?: string } = {}): Promise<Refund[]> {
  if (!(await paymentsPg()))
    return [...mem.refunds.values()].filter((r) => (!f.statuses || f.statuses.includes(r.status)) && (!f.orderId || r.orderId === f.orderId)).sort((a, b) => a.createdAt - b.createdAt);
  let q = createAdminClient().from('refunds').select(R_COLS).order('created_at').limit(500);
  if (f.statuses) q = q.in('status', f.statuses);
  if (f.orderId) q = q.eq('order_id', f.orderId);
  const { data } = await q;
  return (data ?? []).map(rFrom);
}
export async function updateRefund(prev: Refund, patch: Partial<Pick<Refund, 'status' | 'approvedBy' | 'paidMethod' | 'paidRef' | 'paidAt'>>): Promise<Refund> {
  const now = Date.now();
  if (!(await paymentsPg())) {
    const cur = mem.refunds.get(prev.id);
    if (!cur || cur.status !== prev.status) throw new Error('This refund changed meanwhile. Reload.');
    const next = { ...cur, ...patch };
    mem.refunds.set(prev.id, next);
    return next;
  }
  const row: Record<string, unknown> = { updated_at: iso(now) };
  if (patch.status) row.status = patch.status;
  if (patch.approvedBy !== undefined) {
    row.approved_by = uuidOrNull(patch.approvedBy);
    row.approved_at = iso(now);
  }
  if (patch.paidMethod !== undefined) row.paid_method = patch.paidMethod;
  if (patch.paidRef !== undefined) row.paid_ref = patch.paidRef;
  if (patch.paidAt !== undefined) row.paid_at = iso(patch.paidAt);
  const { data, error } = await createAdminClient().from('refunds').update(row).eq('id', prev.id).eq('status', prev.status).select(R_COLS);
  if (error) throw new Error('Could not save the refund.');
  if (!data?.length) throw new Error('This refund changed meanwhile. Reload.');
  return rFrom(data[0]);
}

/* ---------- log ---------- */
export async function logPayment(e: PayEvent): Promise<void> {
  if (!(await paymentsPg())) return void mem.events.push(e);
  const { error } = await createAdminClient()
    .from('payment_events')
    .insert({ attempt_id: e.attemptId ?? null, refund_id: e.refundId ?? null, order_id: e.orderId, actor_id: uuidOrNull(e.actorId), event: e.event, detail: e.detail, created_at: iso(e.at) });
  if (error) throw new Error('Could not log the payment step.');
}
export async function paymentLog(orderId: string): Promise<PayEvent[]> {
  if (!(await paymentsPg())) return mem.events.filter((e) => e.orderId === orderId);
  const { data } = await createAdminClient().from('payment_events').select('attempt_id, refund_id, order_id, actor_id, event, detail, created_at').eq('order_id', orderId).order('id');
  return (data ?? []).map((r) => ({ attemptId: r.attempt_id, refundId: r.refund_id, orderId: r.order_id, actorId: r.actor_id, event: r.event, detail: r.detail ?? {}, at: Date.parse(r.created_at) }));
}
