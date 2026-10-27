import 'server-only';
import { orderStore, toRow, memoryStore as memoryOrders } from '../orders/store';
import type { Order, OrderEvent } from '../orders/machine';
import type { PricedLine } from '../plans/rules';
import { createAdminClient } from '../supabase/server';
import type { RequestedTier } from '../licenceTiers';
import type { Business, DeliveryDetails, Package, QuoteState, QuoteTerms, RequestKind, RequestState } from './rules';

/*
 * Purchase requests, quotations and their logs (migration 0059). Postgres when there, memory otherwise. Only lib/requests/service.ts writes.
 * Accepting a quotation and creating its order is one database transaction (accept_quotation); memory mode does the same steps in order.
 */
export type PurchaseRequest = {
  id: string;
  kind: RequestKind;
  buyerId: string;
  productId: string | null;
  status: RequestState;
  licenceTier: RequestedTier;
  package: Package;
  extras: { express: boolean; hosting: boolean };
  intendedUse: string;
  requirements: string | null;
  delivery: DeliveryDetails;
  business: Business;
  consentVersion: string;
  consentedAt: number;
  verifiedRequirements: string | null;
  requirementsConfirmedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type Quotation = {
  id: string;
  requestId: string;
  version: number;
  status: QuoteState;
  productId: string | null;
  sellerId: string | null;
  ownerType: 'seller' | 'platform';
  lines: PricedLine[];
  currency: string;
  totalCents: number;
  listedCents: number | null;
  priceOverride: boolean;
  overrideReason: string | null;
  overrideApprovedBy: string | null;
  planId: string | null;
  commissionBps: number | null;
  feeCents: number;
  sellerGrossCents: number;
  passThroughCents: number;
  terms: QuoteTerms;
  fileVersionId: string | null;
  createdBy: string | null;
  issuedBy: string | null;
  issuedAt: number | null;
  validUntil: number | null;
  acceptedBy: string | null;
  acceptedAt: number | null;
  orderId: string | null;
  createdAt: number;
  updatedAt: number;
};
export type LogEvent = { actorId: string | null; event: string; from: string | null; to: string | null; note?: string | null; meta?: Record<string, unknown>; at: number };

type Mem = { requests: Map<string, PurchaseRequest>; quotes: Map<string, Quotation>; reqEvents: (LogEvent & { id: string })[]; quoteEvents: (LogEvent & { id: string })[] };
const mem: Mem = ((globalThis as { __requestsMem?: Mem }).__requestsMem ??= { requests: new Map(), quotes: new Map(), reqEvents: [], quoteEvents: [] });

let ready: { ok: boolean; at: number } | undefined;
export async function requestsPg(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('purchase_requests').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

const iso = (v: number | null | undefined) => (typeof v === 'number' ? new Date(v).toISOString() : null);
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : null);
const uuidOrNull = (id: string | null | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
type Row = Record<string, unknown>;

const REQ_COLS =
  'id, kind, buyer_id, product_id, status, licence_tier, package, extras, intended_use, requirements, delivery_details, business, consent_version, consented_at, verified_requirements, requirements_confirmed_at, expires_at, created_at, updated_at';
const reqFromRow = (r: Row): PurchaseRequest => ({
  id: r.id as string,
  kind: r.kind as RequestKind,
  buyerId: r.buyer_id as string,
  productId: (r.product_id as string) ?? null,
  status: r.status as RequestState,
  licenceTier: r.licence_tier as RequestedTier,
  package: r.package as Package,
  extras: { express: false, hosting: false, ...((r.extras as object) ?? {}) },
  intendedUse: r.intended_use as string,
  requirements: (r.requirements as string) ?? null,
  delivery: (r.delivery_details as DeliveryDetails) ?? {},
  business: (r.business as Business) ?? {},
  consentVersion: r.consent_version as string,
  consentedAt: ms(r.consented_at) ?? 0,
  verifiedRequirements: (r.verified_requirements as string) ?? null,
  requirementsConfirmedAt: ms(r.requirements_confirmed_at),
  expiresAt: ms(r.expires_at),
  createdAt: ms(r.created_at) ?? 0,
  updatedAt: ms(r.updated_at) ?? 0,
});

const Q_COLS =
  'id, request_id, version, status, product_id, seller_id, owner_type, lines, currency, total_cents, listed_cents, price_override, override_reason, override_approved_by, plan_id, commission_bps, fee_cents, seller_gross_cents, pass_through_cents, terms, file_version_id, created_by, issued_by, issued_at, valid_until, accepted_by, accepted_at, order_id, created_at, updated_at';
const qFromRow = (r: Row): Quotation => ({
  id: r.id as string,
  requestId: r.request_id as string,
  version: r.version as number,
  status: r.status as QuoteState,
  productId: (r.product_id as string) ?? null,
  sellerId: (r.seller_id as string) ?? null,
  ownerType: r.owner_type === 'platform' ? 'platform' : 'seller',
  lines: r.lines as PricedLine[],
  currency: r.currency as string,
  totalCents: r.total_cents as number,
  listedCents: (r.listed_cents as number) ?? null,
  priceOverride: !!r.price_override,
  overrideReason: (r.override_reason as string) ?? null,
  overrideApprovedBy: (r.override_approved_by as string) ?? null,
  planId: (r.plan_id as string) ?? null,
  commissionBps: (r.commission_bps as number) ?? null,
  feeCents: r.fee_cents as number,
  sellerGrossCents: r.seller_gross_cents as number,
  passThroughCents: (r.pass_through_cents as number) ?? 0,
  terms: r.terms as QuoteTerms,
  fileVersionId: (r.file_version_id as string) ?? null,
  createdBy: (r.created_by as string) ?? null,
  issuedBy: (r.issued_by as string) ?? null,
  issuedAt: ms(r.issued_at),
  validUntil: ms(r.valid_until),
  acceptedBy: (r.accepted_by as string) ?? null,
  acceptedAt: ms(r.accepted_at),
  orderId: (r.order_id as string) ?? null,
  createdAt: ms(r.created_at) ?? 0,
  updatedAt: ms(r.updated_at) ?? 0,
});

/* ---------- requests ---------- */
export async function insertRequest(r: Omit<PurchaseRequest, 'createdAt' | 'updatedAt'>, ev: LogEvent): Promise<PurchaseRequest> {
  if (!(await requestsPg())) {
    const rec = { ...r, createdAt: ev.at, updatedAt: ev.at };
    mem.requests.set(r.id, rec);
    mem.reqEvents.push({ ...ev, id: r.id });
    return rec;
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from('purchase_requests')
    .insert({
      id: r.id,
      kind: r.kind,
      buyer_id: r.buyerId,
      product_id: r.productId,
      status: r.status,
      licence_tier: r.licenceTier,
      package: r.package,
      extras: r.extras,
      intended_use: r.intendedUse,
      requirements: r.requirements,
      delivery_details: r.delivery,
      business: r.business,
      consent_version: r.consentVersion,
      consented_at: iso(r.consentedAt),
      expires_at: iso(r.expiresAt),
    })
    .select(REQ_COLS)
    .single();
  if (error || !data) throw new Error('Could not save the request.');
  await logRequest(r.id, ev);
  return reqFromRow(data);
}

async function logRequest(id: string, ev: LogEvent) {
  if (!(await requestsPg())) return void mem.reqEvents.push({ ...ev, id });
  const { error } = await createAdminClient()
    .from('purchase_request_events')
    .insert({ request_id: id, actor_id: uuidOrNull(ev.actorId), event: ev.event, from_status: ev.from, to_status: ev.to, note: ev.note ?? null, meta: ev.meta ?? {}, created_at: iso(ev.at) });
  if (error) throw new Error('Could not log the request.');
}

export async function getRequest(id: string): Promise<PurchaseRequest | null> {
  if (!(await requestsPg())) return mem.requests.get(id) ?? null;
  const { data } = await createAdminClient().from('purchase_requests').select(REQ_COLS).eq('id', id).maybeSingle();
  return data ? reqFromRow(data) : null;
}

export async function listRequests(f: { buyerId?: string; statuses?: RequestState[]; kind?: RequestKind } = {}): Promise<PurchaseRequest[]> {
  if (!(await requestsPg()))
    return [...mem.requests.values()]
      .filter((r) => (!f.buyerId || r.buyerId === f.buyerId) && (!f.statuses || f.statuses.includes(r.status)) && (!f.kind || r.kind === f.kind))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  let q = createAdminClient().from('purchase_requests').select(REQ_COLS).order('updated_at', { ascending: false }).limit(300);
  if (f.buyerId) q = q.eq('buyer_id', f.buyerId);
  if (f.statuses) q = q.in('status', f.statuses);
  if (f.kind) q = q.eq('kind', f.kind);
  const { data } = await q;
  return (data ?? []).map(reqFromRow);
}

export type RequestPatch = Partial<Pick<PurchaseRequest, 'status' | 'expiresAt' | 'verifiedRequirements' | 'requirementsConfirmedAt'>>;
/* Changes a request only if it is still in the state the caller saw, and logs it. */
export async function updateRequest(prev: PurchaseRequest, patch: RequestPatch, ev: LogEvent): Promise<PurchaseRequest> {
  if (!(await requestsPg())) {
    const cur = mem.requests.get(prev.id);
    if (!cur || cur.status !== prev.status) throw new Error('The request changed meanwhile. Reload and try again.');
    const next = { ...cur, ...patch, updatedAt: ev.at };
    mem.requests.set(prev.id, next);
    mem.reqEvents.push({ ...ev, id: prev.id });
    return next;
  }
  const row: Record<string, unknown> = { updated_at: iso(ev.at) };
  if (patch.status) row.status = patch.status;
  if (patch.expiresAt !== undefined) row.expires_at = iso(patch.expiresAt);
  if (patch.verifiedRequirements !== undefined) row.verified_requirements = patch.verifiedRequirements;
  if (patch.requirementsConfirmedAt !== undefined) row.requirements_confirmed_at = iso(patch.requirementsConfirmedAt);
  const { data, error } = await createAdminClient().from('purchase_requests').update(row).eq('id', prev.id).eq('status', prev.status).select(REQ_COLS);
  if (error) throw new Error('Could not save the request.');
  if (!data?.length) throw new Error('The request changed meanwhile. Reload and try again.');
  await logRequest(prev.id, ev);
  return reqFromRow(data[0]);
}

export async function requestEvents(id: string): Promise<LogEvent[]> {
  if (!(await requestsPg())) return mem.reqEvents.filter((e) => e.id === id);
  const { data } = await createAdminClient().from('purchase_request_events').select('actor_id, event, from_status, to_status, note, meta, created_at').eq('request_id', id).order('id');
  return (data ?? []).map((r) => ({ actorId: r.actor_id, event: r.event, from: r.from_status, to: r.to_status, note: r.note, meta: r.meta ?? {}, at: Date.parse(r.created_at) }));
}

/* ---------- quotations ---------- */
export async function insertQuote(q: Omit<Quotation, 'createdAt' | 'updatedAt'>, ev: LogEvent): Promise<Quotation> {
  if (!(await requestsPg())) {
    if ([...mem.quotes.values()].some((x) => x.requestId === q.requestId && ['draft', 'pending_super', 'issued'].includes(x.status))) throw new Error('This request already has an open quotation.');
    const rec = { ...q, createdAt: ev.at, updatedAt: ev.at };
    mem.quotes.set(q.id, rec);
    mem.quoteEvents.push({ ...ev, id: q.id });
    return rec;
  }
  const db = createAdminClient();
  const { data, error } = await db
    .from('quotations')
    .insert({
      id: q.id,
      request_id: q.requestId,
      version: q.version,
      status: q.status,
      product_id: q.productId,
      seller_id: q.sellerId,
      owner_type: q.ownerType,
      lines: q.lines,
      currency: q.currency,
      total_cents: q.totalCents,
      listed_cents: q.listedCents,
      price_override: q.priceOverride,
      override_reason: q.overrideReason,
      plan_id: q.planId,
      commission_bps: q.commissionBps,
      fee_cents: q.feeCents,
      seller_gross_cents: q.sellerGrossCents,
      pass_through_cents: q.passThroughCents,
      terms: q.terms,
      file_version_id: q.fileVersionId,
      created_by: uuidOrNull(q.createdBy),
    })
    .select(Q_COLS)
    .single();
  if (error || !data) throw new Error(/unique|duplicate/i.test(error?.message ?? '') ? 'This request already has an open quotation.' : 'Could not save the quotation.');
  await logQuote(q.id, ev);
  return qFromRow(data);
}

async function logQuote(id: string, ev: LogEvent) {
  if (!(await requestsPg())) return void mem.quoteEvents.push({ ...ev, id });
  const { error } = await createAdminClient()
    .from('quotation_events')
    .insert({ quotation_id: id, actor_id: uuidOrNull(ev.actorId), event: ev.event, from_status: ev.from, to_status: ev.to, note: ev.note ?? null, meta: ev.meta ?? {}, created_at: iso(ev.at) });
  if (error) throw new Error('Could not log the quotation.');
}

export async function getQuote(id: string): Promise<Quotation | null> {
  if (!(await requestsPg())) return mem.quotes.get(id) ?? null;
  const { data } = await createAdminClient().from('quotations').select(Q_COLS).eq('id', id).maybeSingle();
  return data ? qFromRow(data) : null;
}

export async function quotesOf(requestId: string): Promise<Quotation[]> {
  if (!(await requestsPg())) return [...mem.quotes.values()].filter((q) => q.requestId === requestId).sort((a, b) => b.version - a.version);
  const { data } = await createAdminClient().from('quotations').select(Q_COLS).eq('request_id', requestId).order('version', { ascending: false });
  return (data ?? []).map(qFromRow);
}

export async function listQuotes(statuses: QuoteState[]): Promise<Quotation[]> {
  if (!(await requestsPg())) return [...mem.quotes.values()].filter((q) => statuses.includes(q.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  const { data } = await createAdminClient().from('quotations').select(Q_COLS).in('status', statuses).order('updated_at', { ascending: false }).limit(300);
  return (data ?? []).map(qFromRow);
}

export type QuotePatch = Partial<Pick<Quotation, 'status' | 'issuedBy' | 'issuedAt' | 'validUntil' | 'overrideApprovedBy'>> & { overrideApprovedAt?: number };
/* Moves a quotation on only if it is still in the state the caller saw. The money and terms of an issued quotation never change (database). */
export async function updateQuote(prev: Quotation, patch: QuotePatch, ev: LogEvent): Promise<Quotation> {
  if (!(await requestsPg())) {
    const cur = mem.quotes.get(prev.id);
    if (!cur || cur.status !== prev.status) throw new Error('The quotation changed meanwhile. Reload and try again.');
    const { overrideApprovedAt: _o, ...plain } = patch;
    const next = { ...cur, ...plain, updatedAt: ev.at };
    mem.quotes.set(prev.id, next);
    mem.quoteEvents.push({ ...ev, id: prev.id });
    return next;
  }
  const row: Record<string, unknown> = { updated_at: iso(ev.at) };
  if (patch.status) row.status = patch.status;
  if (patch.issuedBy !== undefined) row.issued_by = uuidOrNull(patch.issuedBy);
  if (patch.issuedAt !== undefined) row.issued_at = iso(patch.issuedAt);
  if (patch.validUntil !== undefined) row.valid_until = iso(patch.validUntil);
  if (patch.overrideApprovedBy !== undefined) row.override_approved_by = uuidOrNull(patch.overrideApprovedBy);
  if (patch.overrideApprovedAt !== undefined) row.override_approved_at = iso(patch.overrideApprovedAt);
  const { data, error } = await createAdminClient().from('quotations').update(row).eq('id', prev.id).eq('status', prev.status).select(Q_COLS);
  if (error) throw new Error('Could not save the quotation: ' + error.message);
  if (!data?.length) throw new Error('The quotation changed meanwhile. Reload and try again.');
  await logQuote(prev.id, ev);
  return qFromRow(data[0]);
}

export async function quoteEvents(id: string): Promise<LogEvent[]> {
  if (!(await requestsPg())) return mem.quoteEvents.filter((e) => e.id === id);
  const { data } = await createAdminClient().from('quotation_events').select('actor_id, event, from_status, to_status, note, meta, created_at').eq('quotation_id', id).order('id');
  return (data ?? []).map((r) => ({ actorId: r.actor_id, event: r.event, from: r.from_status, to: r.to_status, note: r.note, meta: r.meta ?? {}, at: Date.parse(r.created_at) }));
}

/*
 * Accepts a quotation and creates its order in one step. Postgres: the accept_quotation function (one transaction, idempotent).
 * Memory: the same checks and writes in order. Returns the order id; a second call by the same buyer returns the same id.
 */
export class AcceptError extends Error {}
export async function acceptAndCreateOrder(q: Quotation, buyerId: string, order: Order, created: OrderEvent, now: number): Promise<string> {
  if (!(await requestsPg())) {
    const cur = mem.quotes.get(q.id);
    const req = cur ? mem.requests.get(cur.requestId) : undefined;
    if (!cur || !req) throw new AcceptError('quotation_not_found');
    if (req.buyerId !== buyerId) throw new AcceptError('not_your_quotation');
    if (cur.status === 'accepted' && cur.acceptedBy === buyerId && cur.orderId) return cur.orderId;
    if (cur.status !== 'issued') throw new AcceptError('quotation_not_open');
    if (!cur.validUntil || cur.validUntil <= now) throw new AcceptError('quotation_expired');
    if (order.quotationId !== cur.id || order.priceCents !== cur.totalCents || order.feeCents !== cur.feeCents) throw new AcceptError('order_does_not_match_quotation');
    await memoryOrders.insert(order, created);
    mem.quotes.set(cur.id, { ...cur, status: 'accepted', acceptedBy: buyerId, acceptedAt: now, orderId: order.id, updatedAt: now });
    mem.quoteEvents.push({ id: cur.id, actorId: buyerId, event: 'accepted', from: 'issued', to: 'accepted', meta: { order: order.id }, at: now });
    mem.requests.set(req.id, { ...req, status: 'converted', updatedAt: now });
    mem.reqEvents.push({ id: req.id, actorId: buyerId, event: 'converted', from: req.status, to: 'converted', meta: { order: order.id, quotation: cur.id }, at: now });
    return order.id;
  }
  const { data, error } = await createAdminClient().rpc('accept_quotation', {
    p_quote: q.id,
    p_buyer: buyerId,
    p_now: new Date(now).toISOString(),
    p_order: toRow(order),
    p_order_event: { event: created.event, meta: created.meta },
  });
  if (error) throw new AcceptError((error.message.match(/(quotation_not_found|not_your_quotation|quotation_not_open|quotation_expired|order_does_not_match_quotation)/) ?? [])[1] ?? 'accept_failed');
  return data as string;
}
