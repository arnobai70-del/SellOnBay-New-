import 'server-only';
import { auditStrict } from '../admin/audit';
import { ensureLicense } from '../delivery/service';
import { getFile } from '../files/store';
import { LICENCE_TEXT_VERSION } from '../licenceTiers';
import { notify, notifyAdmins } from '../notify';
import { readyMade, type Order } from '../orders/machine';
import { getOrder, move } from '../orders/service';
import { orderStore } from '../orders/store';
import { getQuote } from '../requests/store';
import { slaState } from './rules';
import { createEntitlement, entitlementFor, setEntitlementStatus, type Entitlement } from './store';

/*
 * Release approval and entitlements (owner decision D-A; 12-hour target, 24/7/365). Who does what:
 *   Delivery (or Super, F-12)  authorise a work order to start, approve or refuse a release, return a delivery, suspend or revoke access,
 *                              review legacy paid-but-undelivered orders (F-13) and legacy unpaid orders (F-14)
 *   seller                     sends the delivery of a work order (its files go through the file checks first)
 * Nothing here runs by itself except reminders: a missed target raises alerts and never releases anything.
 */
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const reason5 = (s: string) => (s.trim().length < 5 ? 'Write a short reason (at least 5 characters).' : null);

/* A Delivery admin lets the seller start a paid work order (setup, customisation, live site, custom development). The delivery time starts now. */
export async function authoriseWork(adminId: string | null, orderId: string): Promise<Result<Order>> {
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (!o.quotationId) return fail(409, 'Only orders made from a quotation are authorised here.');
  if (o.state !== 'funded') return fail(409, 'Only a paid order waiting to start can be authorised.');
  if (readyMade(o)) return fail(409, 'This order is ready-made files: it goes straight to release review.');
  await auditStrict(adminId, 'work_authorised', 'order', o.id, {});
  const r = await move(o.id, 'in_delivery', { actorId: adminId, event: 'work_authorised' });
  if (!r.ok) return r;
  await notify(o.sellerId, 'work_authorised', { title: o.title });
  return { ok: true, value: r.order };
}

/*
 * The seller sends a work order's delivery for release. With a file, it must be this order's own delivery file, already approved by the file
 * checks and a reviewer; without one, the seller describes what was done (for example the address of the deployed site) and the product's
 * pinned version is what the buyer gets. Either way an admin approves the release before the buyer sees anything.
 */
export async function submitDelivery(sellerId: string, orderId: string, input: { note: string; fileId?: string }): Promise<Result<Order>> {
  const o = await getOrder(orderId);
  if (!o || o.sellerId !== sellerId) return fail(404, 'Order not found.');
  if (!o.quotationId) return fail(409, 'Send this delivery from the order page.');
  if (!['in_delivery', 'overdue', 'fix_requested'].includes(o.state)) return fail(409, 'This order is not waiting for your delivery.');
  const note = input.note.trim();
  if (note.length < 10 || note.length > 2000) return fail(400, 'Describe what you delivered (10 to 2000 characters).');
  let filesReadyAt = Date.now();
  if (input.fileId) {
    const f = await getFile(input.fileId);
    if (!f || f.orderId !== o.id || f.purpose !== 'delivery' || f.uploadedBy !== sellerId) return fail(404, 'Delivery file not found.');
    if (f.state !== 'approved') return fail(409, 'The delivery file must pass the checks and be approved first.');
    filesReadyAt = f.updatedAt;
  } else if (!o.fileVersionId) return fail(400, 'Upload the delivery files first: this order has no approved product version to deliver.');
  const r = await move(o.id, 'release_pending', {
    actorId: sellerId,
    event: 'delivery_submitted',
    meta: { note: note.slice(0, 500), file: input.fileId ?? null },
    patch: (x) => ({ ...x, filesReadyAt }),
  });
  if (!r.ok) return r;
  await notifyAdmins('release_waiting', { title: o.title, due: r.order.releaseDueAt ? new Date(r.order.releaseDueAt).toUTCString() : 'soon' }, `release:${o.id}:${r.order.filesReadyAt}`);
  return { ok: true, value: r.order };
}

/*
 * The explicit release approval. Only from release_pending, only by a Delivery (or Super) admin, audited before it counts. It creates the
 * buyer's entitlement (exact file version, licence tier and text version, who approved) and the licence key, then tells the buyer.
 */
export async function approveRelease(adminId: string | null, orderId: string, note: string, now = Date.now()): Promise<Result<{ order: Order; entitlement: Entitlement }>> {
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (!o.quotationId) return fail(409, 'Legacy orders are reviewed in the legacy section.');
  if (o.state !== 'release_pending') return fail(409, 'Only an order waiting for release can be released.');
  if (!o.fundedAt) return fail(409, 'The payment is not verified.');
  const q = await getQuote(o.quotationId);
  await auditStrict(adminId, 'release_approved', 'order', o.id, { note: note.trim().slice(0, 1000), dueAt: o.releaseDueAt ?? null, late: o.releaseDueAt ? now > o.releaseDueAt : false });
  const r = await move(o.id, 'delivered', {
    actorId: adminId,
    event: 'release_approved',
    meta: { note: note.trim().slice(0, 500), sla: o.releaseDueAt ? slaState(o.releaseDueAt, now) : null },
    patch: (x) => ({ ...x, releaseApprovedAt: now, releaseApprovedBy: adminId ?? undefined }),
    now,
  });
  if (!r.ok) return r;
  const events = await (await orderStore()).events(o.id);
  const sent = [...events].reverse().find((e) => e.event === 'delivery_submitted');
  // A work order's own checked delivery file, if the seller sent one with the delivery.
  const fileId = (sent?.meta as { file?: string | null } | undefined)?.file ?? null;
  const ent = await createEntitlement({
    orderId: o.id,
    buyerId: o.buyerId,
    productId: o.productId,
    fileVersionId: o.fileVersionId ?? null,
    deliveryFileId: fileId ?? null,
    licenceTier: q?.terms.licenceTier ?? o.licence ?? 'single_project',
    licenceTextVersion: q?.terms.licenceTextVersion ?? LICENCE_TEXT_VERSION,
    releaseApprovedBy: adminId,
    releaseApprovedAt: now,
  });
  await ensureLicense(o.id);
  await notify(o.buyerId, 'files_released', { title: o.title });
  return { ok: true, value: { order: r.order, entitlement: ent } };
}

/* Returns a work order's delivery to the seller with a reason (ready-made files cannot be returned; refund them through Finance instead). */
export async function returnToSeller(adminId: string | null, orderId: string, reason: string): Promise<Result<Order>> {
  const p = reason5(reason);
  if (p) return fail(400, p);
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (o.state !== 'release_pending') return fail(409, 'Only an order waiting for release can be returned.');
  if (readyMade(o)) return fail(409, 'Ready-made files have no seller work to return. Refuse the release through Finance (refund) instead.');
  await auditStrict(adminId, 'delivery_returned', 'order', o.id, { reason });
  const r = await move(o.id, 'in_delivery', { actorId: adminId, event: 'delivery_returned', meta: { reason: reason.slice(0, 500) } });
  if (!r.ok) return r;
  await notify(o.sellerId, 'delivery_returned', { title: o.title, reason });
  return { ok: true, value: r.order };
}

/* Suspend, resume or revoke a buyer's access (for example during an investigation, after a refund, a lost chargeback or a licence breach). */
export async function entitlementAction(adminId: string | null, orderId: string, action: 'suspend' | 'resume' | 'revoke', reason: string): Promise<Result<Entitlement>> {
  const p = reason5(reason);
  if (p) return fail(400, p);
  const e = await entitlementFor(orderId);
  if (!e) return fail(404, 'This order has no entitlement.');
  if (e.status === 'revoked') return fail(409, 'Access was already revoked for good.');
  const to = action === 'suspend' ? 'suspended' : action === 'resume' ? 'active' : 'revoked';
  if (e.status === to) return fail(409, `Access is already ${to}.`);
  await auditStrict(adminId, `entitlement_${action}`, 'order', orderId, { reason, from: e.status, to });
  return { ok: true, value: await setEntitlementStatus(e, to, reason, adminId) };
}

/* ---------- legacy orders (made before SellOnBay 2.0) ---------- */

/* Legacy paid-but-undelivered (F-13) and legacy unpaid (F-14) orders, each needing an individual decision. */
export async function legacyQueue(): Promise<{ paid: Order[]; unpaid: Order[] }> {
  const store = await orderStore();
  const paid = (await store.byState(['funded', 'in_delivery', 'overdue'])).filter((o) => !o.quotationId && !!o.sellerId && !o.releaseApprovedAt);
  const unpaid = (await store.byState(['awaiting_payment', 'payment_review'])).filter((o) => !o.quotationId && !!o.sellerId);
  return { paid, unpaid };
}

/* After an individual review, a legacy paid order's files may be released (recorded as its release approval). Its state is not changed. */
export async function approveLegacyRelease(adminId: string | null, orderId: string, note: string, now = Date.now()): Promise<Result<Order>> {
  const p = reason5(note);
  if (p) return fail(400, p);
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (o.quotationId) return fail(409, 'This is not a legacy order.');
  if (!['funded', 'in_delivery', 'overdue'].includes(o.state) || o.releaseApprovedAt) return fail(409, 'This legacy order is not waiting for review.');
  await auditStrict(adminId, 'legacy_release_approved', 'order', o.id, { note, state: o.state });
  const next: Order = { ...o, releaseApprovedAt: now, releaseApprovedBy: adminId ?? undefined };
  if (!(await (await orderStore()).patch(o, next))) return fail(409, 'This order has just changed. Reload and try again.');
  await notify(o.buyerId, 'files_released', { title: o.title });
  return { ok: true, value: next };
}

/* A legacy unpaid order is cancelled after review (no money moved). Keeping it needs no action. */
export async function cancelLegacyUnpaid(adminId: string | null, orderId: string, reason: string): Promise<Result<Order>> {
  const p = reason5(reason);
  if (p) return fail(400, p);
  const o = await getOrder(orderId);
  if (!o || o.quotationId) return fail(404, 'Legacy order not found.');
  if (o.state !== 'awaiting_payment') return fail(409, 'Only a legacy order still waiting for payment can be cancelled here.');
  await auditStrict(adminId, 'legacy_unpaid_cancelled', 'order', o.id, { reason });
  const r = await move(o.id, 'cancelled', { actorId: adminId, event: 'legacy_review_cancelled', meta: { reason: reason.slice(0, 500) } });
  if (!r.ok) return r;
  await notify(o.buyerId, 'request_update', {
    title: o.title,
    note: 'SellOnBay reviewed this unpaid order from the old checkout and closed it. Nothing was charged. You can send a new request at any time.',
  });
  return { ok: true, value: r.order };
}

/* ---------- scheduled ---------- */

/* Reminds Delivery about orders waiting for release, and alerts once when one passes its 12-hour target. Never releases anything. */
export async function releaseJobs(now = Date.now()): Promise<{ waiting: number; overdue: number }> {
  const list = await (await orderStore()).byState(['release_pending']);
  let overdue = 0;
  for (const o of list) {
    if (!o.releaseDueAt) continue;
    if (slaState(o.releaseDueAt, now) === 'overdue') {
      overdue++;
      await notifyAdmins('release_overdue', { title: o.title }, `release-overdue:${o.id}:${o.releaseDueAt}`);
    } else await notifyAdmins('release_waiting', { title: o.title, due: new Date(o.releaseDueAt).toUTCString() }, `release:${o.id}:${o.filesReadyAt ?? ''}`);
  }
  return { waiting: list.length, overdue };
}
