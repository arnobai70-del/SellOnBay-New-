import 'server-only';
import { auditStrict } from '../admin/audit';
import { DAY_MS } from '../config';
import { notify, notifyAdmins } from '../notify';
import type { Order, OrderEvent } from '../orders/machine';
import { currentPlan } from '../plans/store';
import { sellerPlan } from '../plans/service';
import { accountLockedOut } from '../supabase/viewer';
import { currentLicenceVersion } from '../legal/service';
import { requestableProblem, requestableProduct, type RequestableProduct } from './products';
import {
  OPEN_REQUEST_STATES,
  acceptProblem,
  checkLines,
  checkRequest,
  checkTerms,
  listedLines,
  listedSellerCents,
  mayMoveQuote,
  mayMoveRequest,
  needsSuperApproval,
  quoteMoney,
  validUntil,
  type QuoteState,
  type RequestInput,
  type RequestKind,
  type RequestState,
} from './rules';
import {
  AcceptError,
  acceptAndCreateOrder,
  getQuote,
  getRequest,
  insertQuote,
  insertRequest,
  listQuotes,
  listRequests,
  quotesOf,
  updateQuote,
  updateRequest,
  type PurchaseRequest,
  type Quotation,
} from './store';

/*
 * Purchase Request -> Admin Quotation -> Buyer Acceptance -> Order (owner decision D-E). The only way a new purchase starts.
 * Who does what:  buyer: submit, answer, withdraw, confirm written requirements (custom work), reject or accept a quotation
 *                 Support or Catalog admin: review, ask, decline, set expiry, verify requirements, draft and issue quotations, withdraw
 *                 Super Admin: approve any price that differs from the listed price before it reaches the buyer (O-8)
 * Every step is in the request or quotation log; admin steps are in the audit log first (auditStrict).
 */
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const reasonProblem = (s: string, min = 5) => (s.trim().length < min ? `Write a short reason (at least ${min} characters).` : s.length > 2000 ? 'Keep it under 2000 characters.' : null);

/* ---------- buyer ---------- */

export async function submitRequest(buyerId: string, input: RequestInput & { product?: string; kind?: RequestKind }, now = Date.now()): Promise<Result<PurchaseRequest>> {
  const kind: RequestKind = input.kind === 'custom_dev' ? 'custom_dev' : 'product';
  const c = checkRequest(input, kind);
  if (!c.ok) return fail(400, c.error);
  let product: RequestableProduct | null = null;
  if (kind === 'product') {
    product = await requestableProduct(String(input.product ?? ''));
    const problem = requestableProblem(product);
    if (problem) return fail(404, problem);
    if (product!.sellerId === buyerId) return fail(400, 'You cannot request your own product.');
    if (await accountLockedOut(product!.sellerId)) return fail(404, 'This product is not available.');
    if (c.value.package === 'setup' && !product!.setupCents) return fail(400, 'Setup help is not offered for this product.');
    if (c.value.package === 'custom' && !product!.customCents) return fail(400, 'Customisation is not offered for this product.');
  }
  const open = (await listRequests({ buyerId, statuses: [...OPEN_REQUEST_STATES] })).filter((r) => r.productId === (product?.id ?? null) && r.kind === kind);
  if (open.length) return fail(409, 'You already have an open request for this. Open it from your requests to continue.');
  const id = crypto.randomUUID();
  const req = await insertRequest(
    {
      id,
      kind,
      buyerId,
      productId: product?.id ?? null,
      status: 'submitted',
      licenceTier: c.value.licenceTier,
      package: c.value.package,
      extras: c.value.extras,
      intendedUse: c.value.intendedUse,
      requirements: c.value.requirements,
      delivery: c.value.delivery,
      business: c.value.business,
      consentVersion: c.value.consentVersion,
      consentedAt: now,
      verifiedRequirements: null,
      requirementsConfirmedAt: null,
      expiresAt: null,
    },
    { actorId: buyerId, event: 'submitted', from: null, to: 'submitted', meta: { kind, product: product?.slug ?? null, tier: c.value.licenceTier }, at: now },
  );
  await notify(buyerId, 'request_received', { title: product?.name ?? 'custom development' });
  await notifyAdmins('request_update', { title: product?.name ?? 'Custom development', note: 'A new purchase request is waiting for review.' });
  return { ok: true, value: req };
}

export type BuyerRequestAction = 'answer' | 'withdraw' | 'confirm_requirements';
export async function buyerRequestAction(buyerId: string, requestId: string, action: BuyerRequestAction, note = '', now = Date.now()): Promise<Result<PurchaseRequest>> {
  const r = await getRequest(requestId);
  if (!r || r.buyerId !== buyerId) return fail(404, 'Request not found.');
  const to: RequestState = action === 'withdraw' ? 'withdrawn' : action === 'answer' ? 'under_review' : 'requirements_verified';
  if (action === 'answer' && r.status !== 'needs_info') return fail(409, 'SellOnBay has not asked anything on this request.');
  if (action === 'confirm_requirements') {
    if (r.kind !== 'custom_dev' || r.status !== 'under_review' || !r.verifiedRequirements) return fail(409, 'There is no requirement set waiting for your confirmation.');
  }
  if (!mayMoveRequest(r.status, to)) return fail(409, 'This request can no longer be changed.');
  if (action === 'answer') {
    const p = reasonProblem(note, 2);
    if (p) return fail(400, p);
  }
  try {
    const next = await updateRequest(
      r,
      { status: to, ...(action === 'confirm_requirements' ? { requirementsConfirmedAt: now } : {}) },
      { actorId: buyerId, event: action, from: r.status, to, note: note.trim() || null, at: now },
    );
    if (action !== 'withdraw')
      await notifyAdmins('request_update', { title: 'A purchase request', note: action === 'answer' ? 'The buyer answered your question.' : 'The buyer confirmed the written requirements.' });
    return { ok: true, value: next };
  } catch (e) {
    return fail(409, (e as Error).message);
  }
}

/* ---------- admin: requests ---------- */

export type AdminRequestAction = 'review' | 'ask' | 'decline' | 'set_expiry' | 'propose_requirements';
export async function adminRequestAction(
  adminId: string | null,
  requestId: string,
  action: AdminRequestAction,
  input: { note?: string; expiresInDays?: number; requirements?: string },
  now = Date.now(),
): Promise<Result<PurchaseRequest>> {
  const r = await getRequest(requestId);
  if (!r) return fail(404, 'Request not found.');
  const note = (input.note ?? '').trim();
  if (action === 'set_expiry') {
    const days = Number(input.expiresInDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) return fail(400, 'Give the number of days until the request expires (0 to clear it).');
    if (!OPEN_REQUEST_STATES.includes(r.status)) return fail(409, 'This request is closed.');
    await auditStrict(adminId, 'request_expiry_set', 'purchase_request', r.id, { days });
    const next = await updateRequest(r, { expiresAt: days ? now + days * DAY_MS : null }, { actorId: adminId, event: 'expiry_set', from: r.status, to: r.status, meta: { days }, at: now });
    return { ok: true, value: next };
  }
  if (action === 'propose_requirements') {
    if (r.kind !== 'custom_dev') return fail(400, 'Written requirements are for custom development requests.');
    if (r.status !== 'under_review') return fail(409, 'Open the request for review first.');
    const req = (input.requirements ?? '').trim();
    if (req.length < 50 || req.length > 8000) return fail(400, 'Write the requirement set the buyer will confirm (50 to 8000 characters).');
    await auditStrict(adminId, 'requirements_proposed', 'purchase_request', r.id, { length: req.length });
    const next = await updateRequest(
      r,
      { verifiedRequirements: req, requirementsConfirmedAt: null },
      { actorId: adminId, event: 'requirements_proposed', from: r.status, to: r.status, note: req.slice(0, 4000), at: now },
    );
    await notify(r.buyerId, 'request_update', { title: 'your custom development request', note: 'SellOnBay wrote down your requirements. Please read and confirm them.' });
    return { ok: true, value: next };
  }
  const to: RequestState = action === 'review' ? 'under_review' : action === 'ask' ? 'needs_info' : 'declined';
  if (!mayMoveRequest(r.status, to)) return fail(409, `A request that is ${r.status.replace('_', ' ')} cannot be moved to ${to.replace('_', ' ')}.`);
  if (action !== 'review') {
    const p = reasonProblem(note);
    if (p) return fail(400, p);
  }
  await auditStrict(adminId, `request_${action}`, 'purchase_request', r.id, { note });
  try {
    const next = await updateRequest(r, { status: to }, { actorId: adminId, event: action, from: r.status, to, note: note || null, at: now });
    if (action === 'ask') await notify(r.buyerId, 'request_update', { title: 'your request', note: 'SellOnBay has a question about your request.' });
    if (action === 'decline') await notify(r.buyerId, 'request_update', { title: 'your request', note: `SellOnBay cannot offer this: ${note}` });
    return { ok: true, value: next };
  } catch (e) {
    return fail(409, (e as Error).message);
  }
}

/* ---------- admin: quotations ---------- */

export type DraftInput = { lines: unknown; terms: Record<string, unknown>; overrideReason?: string };

/*
 * Writes a draft quotation (a new version) for a request under review. The money is worked out on the server from the lines and the seller's
 * plan now; the comparison with the listed price decides whether a Super Admin must approve it before it is issued (O-8).
 */
export async function draftQuote(adminId: string | null, requestId: string, input: DraftInput, now = Date.now()): Promise<Result<Quotation>> {
  const r = await getRequest(requestId);
  if (!r) return fail(404, 'Request not found.');
  if (!['under_review', 'requirements_verified'].includes(r.status)) return fail(409, 'Quote a request while it is under review.');
  if (r.kind === 'custom_dev' && (r.status !== 'requirements_verified' || !r.requirementsConfirmedAt))
    return fail(409, 'The buyer must confirm the written requirements before a custom development quotation.');
  const lc = checkLines(input.lines);
  if (!lc.ok) return fail(400, lc.error);
  const tc = checkTerms(input.terms ?? {}, r.licenceTier);
  if (!tc.ok) return fail(400, tc.error);
  tc.terms.licenceTextVersion = await currentLicenceVersion(); // the published licence document (lib/legal), else the built-in draft label
  let product: RequestableProduct | null = null;
  let listed = null;
  if (r.kind === 'product') {
    product = await requestableProduct(r.productId!);
    const problem = requestableProblem(product);
    if (problem) return fail(409, problem);
    listed = r.licenceTier === 'single_project' ? listedLines(product!, r.package, r.extras) : null;
  }
  const override = needsSuperApproval(lc.lines, listed);
  const reason = (input.overrideReason ?? '').trim();
  if (override && reason.length < 5) return fail(400, 'This price differs from the listed price (or there is none). Write why; a Super Admin must approve it.');
  const sellerId = product?.sellerId ?? null;
  const ownerType = product?.ownerType ?? 'platform';
  const plan = sellerId && ownerType === 'seller' ? (await sellerPlan(sellerId)).plan : await currentPlan('free');
  const money = quoteMoney(lc.lines, plan, ownerType);
  const versions = await quotesOf(r.id);
  if (versions.some((q) => ['draft', 'pending_super', 'issued'].includes(q.status))) return fail(409, 'This request already has an open quotation. Withdraw it first to write a new version.');
  await auditStrict(adminId, 'quotation_drafted', 'purchase_request', r.id, { total: money.totalCents, override });
  const q = await insertQuote(
    {
      id: crypto.randomUUID(),
      requestId: r.id,
      version: (versions[0]?.version ?? 0) + 1,
      status: 'draft',
      productId: product?.id ?? null,
      sellerId,
      ownerType,
      lines: lc.lines,
      currency: 'USD',
      totalCents: money.totalCents,
      listedCents: listed ? listedSellerCents(listed) : null,
      priceOverride: override,
      overrideReason: override ? reason : null,
      overrideApprovedBy: null,
      planId: plan.id,
      commissionBps: ownerType === 'platform' ? 10_000 : plan.commissionBps,
      feeCents: money.feeCents,
      sellerGrossCents: money.sellerGrossCents,
      passThroughCents: money.passThroughCents,
      terms: tc.terms,
      fileVersionId: product?.latestVersionId ?? null,
      createdBy: adminId,
      issuedBy: null,
      issuedAt: null,
      validUntil: null,
      acceptedBy: null,
      acceptedAt: null,
      orderId: null,
    },
    { actorId: adminId, event: 'drafted', from: null, to: 'draft', meta: { total: money.totalCents, override }, at: now },
  );
  return { ok: true, value: q };
}

/* Sends a draft to the buyer, or to a Super Admin first when the price differs from the listed one. */
export async function issueQuote(adminId: string | null, quoteId: string, now = Date.now()): Promise<Result<Quotation>> {
  const q = await getQuote(quoteId);
  if (!q) return fail(404, 'Quotation not found.');
  if (q.status !== 'draft') return fail(409, 'Only a draft can be issued.');
  const r = await getRequest(q.requestId);
  if (!r || !['under_review', 'requirements_verified'].includes(r.status)) return fail(409, 'The request is no longer open for a quotation.');
  if (q.priceOverride) {
    await auditStrict(adminId, 'quotation_sent_to_super', 'quotation', q.id, { total: q.totalCents, listed: q.listedCents, reason: q.overrideReason });
    const next = await updateQuote(q, { status: 'pending_super' }, { actorId: adminId, event: 'sent_to_super', from: 'draft', to: 'pending_super', at: now });
    await notifyAdmins('quote_needs_super', { title: 'a quotation', listed: q.listedCents === null ? 'none' : `$${(q.listedCents / 100).toFixed(2)}`, quoted: `$${(q.totalCents / 100).toFixed(2)}` });
    return { ok: true, value: next };
  }
  return issueNow(adminId, q, r, now);
}

async function issueNow(adminId: string | null, q: Quotation, r: PurchaseRequest, now: number): Promise<Result<Quotation>> {
  await auditStrict(adminId, 'quotation_issued', 'quotation', q.id, { total: q.totalCents, validUntil: validUntil(now) });
  const next = await updateQuote(q, { status: 'issued', issuedBy: adminId, issuedAt: now, validUntil: validUntil(now) }, { actorId: adminId, event: 'issued', from: q.status, to: 'issued', at: now });
  await updateRequest(r, { status: 'quoted' }, { actorId: adminId, event: 'quoted', from: r.status, to: 'quoted', meta: { quotation: q.id, version: q.version }, at: now });
  await notify(r.buyerId, 'quote_issued', { title: 'your request', total: `$${(q.totalCents / 100).toFixed(2)}`, until: new Date(validUntil(now)).toUTCString() });
  return { ok: true, value: next };
}

/* A Super Admin approves or sends back a quotation whose price differs from the listed price (O-8). The caller checks the Super scope. */
export async function superDecision(superId: string | null, quoteId: string, decision: 'approve' | 'decline', reason: string, now = Date.now()): Promise<Result<Quotation>> {
  const q = await getQuote(quoteId);
  if (!q) return fail(404, 'Quotation not found.');
  if (q.status !== 'pending_super') return fail(409, 'This quotation is not waiting for Super Admin approval.');
  const p = reasonProblem(reason);
  if (p) return fail(400, p);
  const r = await getRequest(q.requestId);
  if (!r) return fail(404, 'Request not found.');
  await auditStrict(superId, `quotation_override_${decision}`, 'quotation', q.id, { reason, total: q.totalCents, listed: q.listedCents });
  if (decision === 'decline') {
    const next = await updateQuote(q, { status: 'draft' }, { actorId: superId, event: 'override_declined', from: 'pending_super', to: 'draft', note: reason, at: now });
    return { ok: true, value: next };
  }
  const approved = await updateQuote(
    q,
    { overrideApprovedBy: superId, overrideApprovedAt: now },
    { actorId: superId, event: 'override_approved', from: 'pending_super', to: 'pending_super', note: reason, at: now },
  );
  return issueNow(superId, approved, r, now);
}

/* An admin withdraws an open quotation (a new version can then be written). The request goes back to review. */
export async function withdrawQuote(adminId: string | null, quoteId: string, reason: string, now = Date.now()): Promise<Result<Quotation>> {
  const q = await getQuote(quoteId);
  if (!q) return fail(404, 'Quotation not found.');
  const p = reasonProblem(reason);
  if (p) return fail(400, p);
  const to: QuoteState = q.status === 'issued' ? 'withdrawn' : q.status === 'draft' ? 'discarded' : q.status === 'pending_super' ? 'draft' : q.status;
  if (to === q.status || (!mayMoveQuote(q.status, to) && q.status !== 'pending_super')) return fail(409, 'This quotation cannot be withdrawn.');
  await auditStrict(adminId, 'quotation_withdrawn', 'quotation', q.id, { reason, from: q.status });
  const next = await updateQuote(q, { status: to }, { actorId: adminId, event: 'withdrawn', from: q.status, to, note: reason, at: now });
  if (q.status === 'issued') {
    const r = await getRequest(q.requestId);
    if (r && r.status === 'quoted') {
      await updateRequest(r, { status: 'under_review' }, { actorId: adminId, event: 'quotation_withdrawn', from: 'quoted', to: 'under_review', meta: { quotation: q.id }, at: now });
      await notify(r.buyerId, 'request_update', { title: 'your request', note: 'SellOnBay withdrew the quotation and will send a new one.' });
    }
  }
  return { ok: true, value: next };
}

/* ---------- buyer: quotations ---------- */

export async function rejectQuote(buyerId: string, quoteId: string, note: string, now = Date.now()): Promise<Result<Quotation>> {
  const q = await getQuote(quoteId);
  const r = q ? await getRequest(q.requestId) : null;
  if (!q || !r || r.buyerId !== buyerId) return fail(404, 'Quotation not found.');
  if (q.status !== 'issued') return fail(409, 'This quotation is no longer open.');
  const next = await updateQuote(q, { status: 'rejected' }, { actorId: buyerId, event: 'rejected', from: 'issued', to: 'rejected', note: note.trim().slice(0, 2000) || null, at: now });
  await updateRequest(r, { status: 'under_review' }, { actorId: buyerId, event: 'quotation_rejected', from: r.status, to: 'under_review', note: note.trim().slice(0, 2000) || null, at: now });
  await notifyAdmins('request_update', { title: 'A quotation', note: 'The buyer declined the quotation and asked for changes.' });
  return { ok: true, value: next };
}

/*
 * The buyer accepts the exact quotation version. The order is built here from the quotation only (never from the browser) and is created in
 * the same transaction as the acceptance. Accepting again returns the same order.
 */
export async function acceptQuote(buyerId: string, quoteId: string, now = Date.now()): Promise<Result<{ orderId: string }>> {
  const q = await getQuote(quoteId);
  const r = q ? await getRequest(q.requestId) : null;
  if (!q || !r) return fail(404, 'Quotation not found.');
  const problem = acceptProblem({ status: q.status, validUntil: q.validUntil, buyerId: r.buyerId }, buyerId, now);
  if (problem) return fail(r.buyerId === buyerId ? 409 : 404, problem);
  if (q.status === 'accepted' && q.orderId) return { ok: true, value: { orderId: q.orderId } };
  const product = q.productId ? await requestableProduct(q.productId) : null;
  if (q.productId && (!product || product.status !== 'live')) return fail(409, 'This product is no longer available. Ask SellOnBay about it.');
  const order: Order = {
    id: crypto.randomUUID(),
    kind: r.kind === 'custom_dev' ? 'custom' : 'product',
    pkg: r.package,
    deliveryType: product?.deliveryType ?? 'download',
    state: 'awaiting_payment',
    title: product?.name ?? 'Custom development',
    buyerId,
    sellerId: q.sellerId,
    productId: q.productId,
    productKey: product?.slug ?? null,
    devKey: null,
    brief: r.kind === 'custom_dev' ? (r.verifiedRequirements ?? undefined) : undefined,
    lines: q.lines.map((l) => [l.label, l.cents]),
    priceCents: q.totalCents,
    feeCents: q.feeCents,
    refundedCents: 0,
    currency: q.currency,
    days: Math.min(60, Math.max(1, q.terms.deliveryDays)),
    hours: q.terms.deliveryHours,
    express: q.lines.some((l) => l.kind === 'express'),
    instant: false,
    demo: false,
    domain: r.delivery.domain ? { name: r.delivery.domain, source: 'own' } : undefined,
    appName: r.delivery.appName,
    oses: r.delivery.oses,
    githubUsername: r.delivery.github,
    licence: q.terms.licenceTier,
    supportDays: q.terms.supportDays,
    updateDays: q.terms.updateDays,
    attempts: 0,
    createdAt: now,
    quotationId: q.id,
    sellerGrossCents: q.sellerGrossCents,
    feePlanId: q.planId ?? undefined,
    fileVersionId: q.fileVersionId ?? undefined,
  };
  const created: OrderEvent = {
    orderId: order.id,
    actorId: buyerId,
    event: 'created_from_quotation',
    from: null,
    to: 'awaiting_payment',
    meta: { quotation: q.id, version: q.version, total: q.totalCents },
    at: now,
  };
  try {
    const orderId = await acceptAndCreateOrder(q, buyerId, order, created, now);
    await notifyAdmins('quote_accepted', { title: order.title });
    return { ok: true, value: { orderId } };
  } catch (e) {
    if (e instanceof AcceptError) {
      const words: Record<string, string> = {
        quotation_expired: 'This quotation has expired. Ask SellOnBay for a new one.',
        quotation_not_open: 'This quotation can no longer be accepted.',
        not_your_quotation: 'Quotation not found.',
      };
      return fail(409, words[e.message] ?? 'The quotation could not be accepted. Reload and try again.');
    }
    throw e;
  }
}

/* ---------- scheduled ---------- */

/* Expires issued quotations after their 7 days, and requests after the expiry an admin set. Nothing else expires by itself. */
export async function expireDue(now = Date.now()): Promise<{ quotes: number; requests: number }> {
  let quotes = 0,
    requests = 0;
  for (const q of await listQuotes(['issued'])) {
    if (!q.validUntil || q.validUntil > now) continue;
    try {
      await updateQuote(q, { status: 'expired' }, { actorId: null, event: 'expired', from: 'issued', to: 'expired', at: now });
      const r = await getRequest(q.requestId);
      if (r && r.status === 'quoted')
        await updateRequest(r, { status: 'under_review' }, { actorId: null, event: 'quotation_expired', from: 'quoted', to: 'under_review', meta: { quotation: q.id }, at: now });
      quotes++;
    } catch {
      // someone acted on it at the same moment; the next run looks again
    }
  }
  for (const r of await listRequests({ statuses: ['submitted', 'under_review', 'needs_info', 'requirements_verified'] })) {
    if (!r.expiresAt || r.expiresAt > now) continue;
    try {
      await updateRequest(r, { status: 'expired' }, { actorId: null, event: 'expired', from: r.status, to: 'expired', at: now });
      await notify(r.buyerId, 'request_update', { title: 'your request', note: 'Your request expired. You can send a new one at any time.' });
      requests++;
    } catch {
      // changed meanwhile
    }
  }
  return { quotes, requests };
}
