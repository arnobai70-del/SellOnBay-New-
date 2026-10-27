import 'server-only';
import { audit, auditStrict } from '../admin/audit';
import { CONFIG, HOUR_MS } from '../config';
import { getFile } from '../files/store';
import { notify, notifyAdmins } from '../notify';
import { getOrder } from '../orders/service';
import { RELEASED_STATES } from '../release/rules';
import { entitlementFor } from '../release/store';
import { requestableProduct } from '../requests/products';
import { openLinkedRequest } from '../requests/service';
import { getQuote } from '../requests/store';
import { canMove, checkPolicy, checkRequest, OPEN_REVISION, triage, type AcceptedRevisions, type RevisionKind, type RevisionState } from './rules';
import { policiesOf, policyById, putPolicy, putRevision, revisionById, revisionsFor, type Policy, type Revision } from './store';

/*
 * Revisions (Blueprint 5.6, F-11). Rules in lib/revisions/rules.ts; this file looks up the facts and writes through the store.
 * Who may do what (the routes check the account; these functions check the order):
 *   seller   proposes a product's revision policy; sends revised work on an assigned revision of their own order
 *   Catalog  approves or rejects a policy
 *   Delivery/Support  decides the kind of a submitted revision; Delivery approves its release (the same rule as every release: never automatic)
 *   buyer    asks for a revision on their released order; confirms it is done or says it is not
 */
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; blocked?: boolean };
const fail = (status: number, error: string, blocked?: boolean) => ({ ok: false as const, status, error, ...(blocked ? { blocked } : {}) });

/* ---------- policies ---------- */
export async function approvedPolicy(productId: string): Promise<Policy | null> {
  return (await policiesOf(productId)).find((p) => p.status === 'approved') ?? null;
}

export async function proposePolicy(sellerId: string, product_: string, raw: Record<string, unknown>, now = Date.now()): Promise<Result<Policy>> {
  const product = await requestableProduct(product_); // id or slug
  if (!product || product.sellerId !== sellerId) return fail(404, 'Listing not found.');
  const c = checkPolicy(raw);
  if (!c.ok) return fail(400, c.error);
  const productId = product.id;
  const all = await policiesOf(productId);
  const open = all.find((p) => p.status === 'proposed');
  if (open) {
    const next = { ...open, ...c.value };
    await putPolicy(next, false);
    return { ok: true, value: next };
  }
  const p: Policy = {
    ...c.value,
    id: crypto.randomUUID(),
    productId,
    version: (all[0]?.version ?? 0) + 1,
    status: 'proposed',
    proposedBy: sellerId,
    decidedBy: null,
    decidedAt: null,
    decisionReason: '',
    createdAt: now,
  };
  await putPolicy(p, true);
  await notifyAdmins('request_update', { title: product.name, note: 'A seller proposed revision terms for a listing.' });
  return { ok: true, value: p };
}

export async function decidePolicy(adminId: string | null, policyId: string, decision: 'approve' | 'reject', reason: string, now = Date.now()): Promise<Result<Policy>> {
  const p = await policyById(policyId);
  if (!p) return fail(404, 'Policy not found.');
  if (p.status !== 'proposed') return fail(409, 'This policy was already decided.');
  const why = reason.replace(/\s+/g, ' ').trim();
  if (decision === 'reject' && why.length < 5) return fail(400, 'Say why the terms are rejected.');
  await auditStrict(adminId, `revision_policy_${decision}d`, 'product', p.productId, { policy: p.id, version: p.version, reason: why });
  if (decision === 'approve') {
    const current = (await policiesOf(p.productId)).find((x) => x.status === 'approved');
    if (current) await putPolicy({ ...current, status: 'superseded' }, false);
  }
  const next: Policy = { ...p, status: decision === 'approve' ? 'approved' : 'rejected', decidedBy: adminId, decidedAt: now, decisionReason: why.slice(0, 500) };
  await putPolicy(next, false);
  return { ok: true, value: next };
}

/* ---------- revisions ---------- */
/* The revision terms the buyer accepted (the quotation snapshot). Orders made before quotations have none: only defects then. */
async function acceptedTerms(quotationId: string | null | undefined): Promise<AcceptedRevisions | null> {
  if (!quotationId) return null;
  const q = await getQuote(quotationId);
  return q?.terms.revisions ?? null;
}
const usedAllowance = (all: Revision[]) => all.filter((r) => r.countsAllowance && r.status !== 'declined').length;

export async function revisionSummary(orderId: string): Promise<{ terms: AcceptedRevisions | null; used: number; revisions: Revision[] }> {
  const o = await getOrder(orderId);
  const revisions = await revisionsFor({ orderId });
  return { terms: o ? await acceptedTerms(o.quotationId) : null, used: usedAllowance(revisions), revisions };
}

export async function requestRevision(buyerId: string, orderId: string, raw: { description?: unknown; hint?: unknown; consent?: unknown }, now = Date.now()): Promise<Result<Revision>> {
  const o = await getOrder(orderId);
  if (!o || !o.buyerId || o.buyerId !== buyerId) return fail(404, 'Order not found.');
  if (!(RELEASED_STATES as readonly string[]).includes(o.state)) return fail(409, 'You can ask for a change once the order has been delivered.');
  if (raw.consent !== true) return fail(400, 'Please agree to the request terms.');
  const c = checkRequest(raw);
  if (!c.ok) return fail(c.blocked ? 422 : 400, c.error, c.blocked);
  const all = await revisionsFor({ orderId });
  if (all.some((r) => OPEN_REVISION.includes(r.status))) return fail(409, 'This order already has an open change request. Wait for it to finish.');
  const rev: Revision = {
    id: crypto.randomUUID(),
    orderId,
    buyerId,
    sellerId: o.sellerId,
    description: c.description,
    hint: c.hint,
    kind: null,
    status: 'submitted',
    countsAllowance: false,
    decisionNote: '',
    requestId: null,
    fileId: null,
    deliveryNote: '',
    submittedForReleaseAt: null,
    releaseDueAt: null,
    releasedAt: null,
    releasedBy: null,
    followsId: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await putRevision(rev, null, { actorId: buyerId, event: 'submitted', from: null, to: 'submitted', at: now });
  } catch (e) {
    return fail(409, (e as Error).message);
  }
  await notifyAdmins('request_update', { title: o.title, note: c.hint === 'defect' ? 'A buyer reported a defect.' : 'A buyer asked for a change.' });
  return { ok: true, value: rev };
}

async function step(r: Revision, to: RevisionState, patch: Partial<Revision>, ev: { actorId: string | null; event: string; note?: string }, now: number): Promise<Result<Revision>> {
  if (!canMove(r.status, to)) return fail(409, `A revision that is ${r.status.replace('_', ' ')} cannot become ${to.replace('_', ' ')}.`);
  try {
    const next = await putRevision({ ...r, ...patch, status: to, updatedAt: now }, r.status, { ...ev, from: r.status, to, at: now });
    return { ok: true, value: next };
  } catch (e) {
    return fail(409, (e as Error).message);
  }
}

/*
 * An admin decides what a submitted revision is. A paid change or feature needs the written requirement set the buyer will confirm; it
 * then follows the custom development flow as its own order (request, quotation, payment into escrow, release).
 */
export async function triageRevision(adminId: string | null, id: string, input: { kind: RevisionKind | 'decline'; note: string; requirements?: string }, now = Date.now()): Promise<Result<Revision>> {
  const r = await revisionById(id);
  if (!r) return fail(404, 'Revision not found.');
  if (r.status !== 'submitted') return fail(409, 'This revision was already decided.');
  const o = await getOrder(r.orderId);
  if (!o) return fail(404, 'Order not found.');
  const note = input.note.replace(/\s+/g, ' ').trim();
  if (note.length < 5) return fail(400, 'Write a short note for the buyer (what will happen and why).');
  const all = await revisionsFor({ orderId: r.orderId });
  const releasedAt = o.releaseApprovedAt ?? o.deliveredAt ?? o.createdAt;
  const t = triage(input.kind, await acceptedTerms(o.quotationId), { used: usedAllowance(all), releasedAt, now });
  if (!t.ok) return fail(409, t.error);
  const kind = input.kind === 'decline' ? null : input.kind;
  await auditStrict(adminId, 'revision_triaged', 'order', r.orderId, { revision: r.id, kind: input.kind, counts: t.counts });
  let requestId: string | null = null;
  if (t.to === 'quoted') {
    const lr = await openLinkedRequest(adminId, { parent: o, requirements: input.requirements ?? '', buyerConsentedAt: r.createdAt, revisionId: r.id }, now);
    if (!lr.ok) return lr;
    requestId = lr.value.id;
  }
  const res = await step(r, t.to, { kind, countsAllowance: t.counts, decisionNote: note.slice(0, 2000), requestId }, { actorId: adminId, event: `triaged_${input.kind}`, note }, now);
  if (!res.ok) return res;
  await notify(r.buyerId, 'request_update', { title: o.title, note: t.to === 'declined' ? `SellOnBay cannot do this change: ${note}` : note });
  if (t.to === 'assigned' && r.sellerId) await notify(r.sellerId, 'request_update', { title: o.title, note: 'SellOnBay asked you for a revision on this order.' });
  return res;
}

/*
 * The seller sends the revised work. Download orders need a revision file that passed the checks and a human review (lib/files, purpose
 * "revision"); live sites and repositories may send a note only. The release clock (12 consecutive hours, never an automatic release) starts.
 */
export async function submitRevisionWork(sellerId: string, id: string, input: { note: string; fileId?: string }, now = Date.now()): Promise<Result<Revision>> {
  const r = await revisionById(id);
  if (!r || !r.sellerId || r.sellerId !== sellerId) return fail(404, 'Revision not found.');
  if (r.status !== 'assigned') return fail(409, 'This revision is not waiting for your work.');
  const o = await getOrder(r.orderId);
  if (!o) return fail(404, 'Order not found.');
  const note = input.note.replace(/\r\n?/g, '\n').trim();
  if (note.length < 10) return fail(400, 'Say what you changed (at least 10 characters).');
  let fileId: string | null = null;
  if (input.fileId) {
    const f = await getFile(input.fileId);
    if (!f || f.purpose !== 'revision' || f.orderId !== r.orderId || f.uploadedBy !== sellerId) return fail(404, 'File not found.');
    if (f.state !== 'approved') return fail(409, 'This file has not passed the checks and the review yet.');
    fileId = f.id;
  } else if (o.deliveryType === 'download') return fail(400, 'Attach the revised files (checked and reviewed) for a download order.');
  return step(
    r,
    'release_pending',
    { fileId, deliveryNote: note.slice(0, 2000), submittedForReleaseAt: now, releaseDueAt: now + CONFIG.release.slaHours * HOUR_MS },
    { actorId: sellerId, event: 'work_submitted', note: note.slice(0, 500) },
    now,
  );
}

export async function releaseRevision(adminId: string | null, id: string, note: string, now = Date.now()): Promise<Result<Revision>> {
  const r = await revisionById(id);
  if (!r) return fail(404, 'Revision not found.');
  if (r.status !== 'release_pending') return fail(409, 'Only revised work waiting for release can be released.');
  const ent = await entitlementFor(r.orderId);
  const o = await getOrder(r.orderId);
  if (o?.quotationId && (!ent || ent.status !== 'active')) return fail(409, 'The order has no active entitlement, so nothing can be released.');
  if (r.fileId) {
    const f = await getFile(r.fileId);
    if (!f || f.state !== 'approved') return fail(409, 'The revision file is no longer approved.');
  }
  await auditStrict(adminId, 'revision_released', 'order', r.orderId, { revision: r.id, file: r.fileId, late: r.releaseDueAt ? now > r.releaseDueAt : false, note: note.trim().slice(0, 500) });
  const res = await step(r, 'delivered', { releasedAt: now, releasedBy: adminId }, { actorId: adminId, event: 'released', note: note.trim().slice(0, 500) }, now);
  if (res.ok && o) await notify(r.buyerId, 'files_released', { title: o.title });
  return res;
}

export async function returnRevision(adminId: string | null, id: string, reason: string, now = Date.now()): Promise<Result<Revision>> {
  const r = await revisionById(id);
  if (!r) return fail(404, 'Revision not found.');
  const why = reason.replace(/\s+/g, ' ').trim();
  if (why.length < 5) return fail(400, 'Say what the seller must fix.');
  if (r.status !== 'release_pending') return fail(409, 'Only revised work waiting for release can be returned.');
  await audit(adminId, 'revision_returned', 'order', r.orderId, { revision: r.id, reason: why });
  const res = await step(r, 'assigned', { fileId: null, submittedForReleaseAt: null, releaseDueAt: null }, { actorId: adminId, event: 'returned', note: why }, now);
  if (res.ok && r.sellerId) await notify(r.sellerId, 'request_update', { title: 'a revision', note: `SellOnBay returned your revision: ${why}` });
  return res;
}

/* The buyer confirms a delivered revision is done, or says it is not (it goes back to the seller). */
export async function buyerRevisionAnswer(buyerId: string, id: string, answer: 'done' | 'not_done', note: string, now = Date.now()): Promise<Result<Revision>> {
  const r = await revisionById(id);
  if (!r || r.buyerId !== buyerId) return fail(404, 'Revision not found.');
  if (r.status !== 'delivered') return fail(409, 'This revision is not waiting for your answer.');
  const words = note.replace(/\s+/g, ' ').trim();
  if (answer === 'not_done' && words.length < 10) return fail(400, 'Say what is still not done (at least 10 characters).');
  if (answer === 'not_done') {
    // The released revision keeps its release in the record: it is closed, and a follow-up (same kind, never counted again) goes back to the
    // seller; the follow-up needs its own release approval.
    const closed = await step(r, 'closed', {}, { actorId: buyerId, event: 'not_done', note: words }, now);
    if (!closed.ok) return closed;
    const follow: Revision = {
      ...r,
      id: crypto.randomUUID(),
      description: `${words}

(Follow-up: the earlier change was reported as not done.)`.slice(0, 4000),
      status: 'assigned',
      countsAllowance: false,
      fileId: null,
      deliveryNote: '',
      submittedForReleaseAt: null,
      releaseDueAt: null,
      releasedAt: null,
      releasedBy: null,
      followsId: r.id,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await putRevision(follow, null, { actorId: buyerId, event: 'follow_up_opened', from: null, to: 'assigned', note: words, at: now });
    } catch (e) {
      return fail(409, (e as Error).message);
    }
    await notifyAdmins('request_update', { title: 'a revision', note: 'A buyer says a delivered revision is not done.' });
    if (r.sellerId) await notify(r.sellerId, 'request_update', { title: 'a revision', note: 'The buyer says the revision is not done yet. See the follow-up.' });
    return { ok: true, value: follow };
  }
  return step(r, 'closed', {}, { actorId: buyerId, event: 'confirmed_done', note: words || undefined }, now);
}

/* The released revision file a buyer may download (checked again on every download, behind the order's release gate). */
export async function releasedRevisionFile(orderId: string, revisionId: string): Promise<string | null> {
  const r = await revisionById(revisionId);
  if (!r || r.orderId !== orderId || !r.releasedAt || !r.fileId) return null;
  return r.fileId;
}
