import 'server-only';
import { auditStrict } from '../admin/audit';
import { heldToRefundDue, manualReceived, MANUAL_REF, refundPaid } from '../ledger';
import { ledgerStore } from '../ledgerStore';
import { notify, notifyAdmins } from '../notify';
import { cancel, fund, getOrder, move, refundAtProvider } from '../orders/service';
import type { Order } from '../orders/machine';
import { checkMethod, checkReconciliation, checkSubmission, coverage, orderCode, proofKind, referenceKey, PROOF_MAX_BYTES, type MethodInput } from './rules';
import {
  DuplicateReference,
  attemptsFor,
  decideAttempt,
  getAttempt,
  getMethod,
  getRefund,
  insertAttempt,
  insertRefund,
  listRefunds,
  logPayment,
  putProof,
  saveMethod,
  updateRefund,
  type Attempt,
  type PaymentMethod,
  type Refund,
} from './store';

/*
 * Manual-first payments (owner decisions D-I, F-4, F-5):
 *   buyer          submits a payment with the method, the transaction reference, the amount, the date and a private proof
 *   Finance        reconciles it against funds that actually arrived (amount received, statement reference, time) or rejects it
 *   the system     funds the order once reconciled payments cover the amount due (lib/orders fund -> ledger), never on the proof alone;
 *                  money above the amount due becomes a refund for Finance
 *   Finance        approves and records refunds (Super Admin may act as Finance, F-12); nothing is refunded automatically
 * Which banks and wallets are offered is not decided in code (blocker B-1): Finance enters them as payment methods.
 */
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const today = (now: number) => new Date(now).toISOString().slice(0, 10);
const PAYABLE: readonly Order['state'][] = ['awaiting_payment', 'payment_review'];

/* ---------- methods (Finance) ---------- */
export async function saveMethodAsAdmin(adminId: string | null, input: Partial<MethodInput> & { id?: string }, reason: string): Promise<Result<PaymentMethod>> {
  const c = checkMethod(input);
  if (!c.ok) return fail(400, c.error);
  if (reason.trim().length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  const isNew = !input.id;
  if (!isNew && !(await getMethod(input.id!))) return fail(404, 'Payment method not found.');
  const id = input.id ?? crypto.randomUUID();
  await auditStrict(adminId, isNew ? 'payment_method_added' : 'payment_method_changed', 'payment_method', id, { label: c.value.label, kind: c.value.kind, active: c.value.active, reason });
  return { ok: true, value: await saveMethod({ id, ...c.value }, adminId, isNew) };
}

/* ---------- buyer ---------- */
export type Proof = { bytes: Uint8Array };

/* A buyer reports a manual payment for their own quotation order. It funds nothing by itself. */
export async function submitManualPayment(
  buyerId: string,
  orderId: string,
  input: { methodId?: string; reference?: string; amountCents?: number; paidOn?: string },
  proof: Proof | null,
  now = Date.now(),
): Promise<Result<Attempt>> {
  const o = await getOrder(orderId);
  if (!o || o.buyerId !== buyerId) return fail(404, 'Order not found.');
  if (!o.quotationId) return fail(409, 'This order is paid another way.');
  if (!PAYABLE.includes(o.state)) return fail(409, 'This order is not waiting for payment.');
  const c = checkSubmission(input, o.priceCents, today(now));
  if (!c.ok) return fail(400, c.error);
  const method = await getMethod(c.value.methodId);
  if (!method || !method.active) return fail(400, 'Choose one of the payment methods shown.');
  let proofPath: string | null = null;
  const id = crypto.randomUUID();
  if (proof) {
    if (proof.bytes.byteLength > PROOF_MAX_BYTES) return fail(413, 'The proof can be at most 5 MB.');
    const kind = proofKind(proof.bytes);
    if (!kind) return fail(400, 'The proof must be a PNG, JPEG, WebP picture or a PDF.');
    proofPath = `${o.id}/${id}.${kind.ext}`;
    await putProof(proofPath, proof.bytes, kind.type);
  }
  let a: Attempt;
  try {
    a = await insertAttempt({
      id,
      orderId: o.id,
      kind: 'manual',
      methodId: method.id,
      provider: null,
      reference: c.value.reference,
      referenceKey: referenceKey(c.value.reference),
      amountClaimedCents: c.value.amountCents,
      currency: method.currency,
      paidOn: c.value.paidOn,
      proofPath,
      status: 'submitted',
      amountReceivedCents: null,
      statementRef: null,
      receivedAt: null,
      reviewedBy: null,
      reviewNote: null,
      createdBy: buyerId,
    });
  } catch (e) {
    if (e instanceof DuplicateReference) return fail(409, 'This transaction reference was already sent. If it is a new payment, check the reference.');
    throw e;
  }
  await logPayment({ attemptId: a.id, orderId: o.id, actorId: buyerId, event: 'submitted', detail: { method: method.label, amount: a.amountClaimedCents, proof: !!proofPath }, at: now });
  if (o.state === 'awaiting_payment') await move(o.id, 'payment_review', { actorId: buyerId, event: 'payment_submitted', meta: { attempt: a.id } });
  await notifyAdmins('payment_submitted', { title: o.title, amount: usd(a.amountClaimedCents), method: method.label });
  return { ok: true, value: a };
}

/* ---------- Finance ---------- */

/*
 * Finance confirms that money arrived. The reconciled amount is booked as held for the order; once the held money covers the amount due,
 * the order is funded through the normal path (ledger "pay:<order>", once). Money above the amount due, or arriving for an order that is no
 * longer waiting, is owed back and becomes a refund. Audited before anything changes.
 */
export async function reconcile(
  financeId: string | null,
  attemptId: string,
  input: { amountReceivedCents?: number; statementRef?: string; receivedAt?: number; note?: string },
  now = Date.now(),
): Promise<Result<{ attempt: Attempt; funded: boolean; shortCents: number; excessCents: number }>> {
  const a = await getAttempt(attemptId);
  if (!a) return fail(404, 'Payment not found.');
  if (a.status !== 'submitted') return fail(409, 'This payment was already decided.');
  const c = checkReconciliation(input, now);
  if (!c.ok) return fail(400, c.error);
  const o = await getOrder(a.orderId);
  if (!o) return fail(404, 'Order not found.');
  await auditStrict(financeId, 'payment_reconciled', 'payment_attempt', a.id, {
    order: o.id,
    claimed: a.amountClaimedCents,
    received: c.value.amountReceivedCents,
    statementRef: c.value.statementRef,
  });
  const done = await decideAttempt(a, {
    status: 'reconciled',
    amountReceivedCents: c.value.amountReceivedCents,
    statementRef: c.value.statementRef,
    receivedAt: c.value.receivedAt,
    reviewedBy: financeId,
    reviewNote: (input.note ?? '').trim().slice(0, 1000) || null,
  });
  const L = await ledgerStore();
  await L.post(manualReceived(o.id, a.id, c.value.amountReceivedCents));
  await logPayment({ attemptId: a.id, orderId: o.id, actorId: financeId, event: 'reconciled', detail: { received: c.value.amountReceivedCents }, at: now });
  const reconciled = (await attemptsFor(o.id)).filter((x) => x.status === 'reconciled').map((x) => x.amountReceivedCents ?? 0);

  // Money for an order that is no longer waiting (paid another way, cancelled): all of this payment goes back.
  if (!PAYABLE.includes(o.state)) {
    await owedBack(financeId, o, a, c.value.amountReceivedCents, 'Payment arrived for an order that was no longer waiting for it.', now);
    return { ok: true, value: { attempt: done, funded: false, shortCents: 0, excessCents: c.value.amountReceivedCents } };
  }
  const cov = coverage(o.priceCents, reconciled);
  if (!cov.covered) {
    await notify(o.buyerId, 'request_update', {
      title: o.title,
      note: `SellOnBay received ${usd(cov.receivedCents)} of ${usd(o.priceCents)}. Please pay the remaining ${usd(cov.shortCents)} and report it on your order.`,
    });
    if (o.state === 'payment_review' && !(await attemptsFor(o.id)).some((x) => x.status === 'submitted'))
      await move(o.id, 'awaiting_payment', { actorId: financeId, event: 'part_paid', meta: { received: cov.receivedCents } });
    return { ok: true, value: { attempt: done, funded: false, shortCents: cov.shortCents, excessCents: 0 } };
  }
  const r = await fund(o.id, { ref: `${MANUAL_REF}${a.id}`, brand: 'Manual payment', last4: '' }, undefined, financeId);
  if (!r.ok) return fail(409, `The payment was recorded but the order could not be funded: ${r.error}`);
  if (cov.excessCents > 0) await owedBack(financeId, o, a, cov.excessCents, 'The buyer paid more than the amount due.', now);
  await logPayment({ attemptId: a.id, orderId: o.id, actorId: financeId, event: 'order_funded', detail: { received: cov.receivedCents, due: o.priceCents }, at: now });
  await notify(o.buyerId, 'payment_reconciled', { title: o.title });
  return { ok: true, value: { attempt: done, funded: true, shortCents: 0, excessCents: cov.excessCents } };
}

async function owedBack(actorId: string | null, o: Order, a: Attempt, amountCents: number, reason: string, now: number) {
  await (await ledgerStore()).post(heldToRefundDue(o.id, amountCents, a.id));
  try {
    const rf = await insertRefund({
      id: crypto.randomUUID(),
      orderId: o.id,
      attemptId: a.id,
      kind: 'overpayment',
      amountCents,
      reason,
      status: 'requested',
      requestedBy: actorId,
      approvedBy: null,
      paidMethod: null,
      paidRef: null,
      paidAt: null,
    });
    await logPayment({ refundId: rf.id, attemptId: a.id, orderId: o.id, actorId, event: 'refund_requested', detail: { amount: amountCents, kind: 'overpayment' }, at: now });
  } catch (e) {
    if ((e as Error).message !== 'already recorded') throw e;
  }
}

/* Finance rejects a reported payment (nothing arrived, wrong amount, wrong reference). The buyer is told why. */
export async function rejectPayment(financeId: string | null, attemptId: string, reason: string, now = Date.now()): Promise<Result<Attempt>> {
  const why = reason.trim();
  if (why.length < 5) return fail(400, 'Tell the buyer why (at least 5 characters).');
  const a = await getAttempt(attemptId);
  if (!a) return fail(404, 'Payment not found.');
  if (a.status !== 'submitted') return fail(409, 'This payment was already decided.');
  await auditStrict(financeId, 'payment_rejected', 'payment_attempt', a.id, { order: a.orderId, reason: why });
  const done = await decideAttempt(a, { status: 'rejected', reviewedBy: financeId, reviewNote: why });
  await logPayment({ attemptId: a.id, orderId: a.orderId, actorId: financeId, event: 'rejected', detail: { reason: why }, at: now });
  const o = await getOrder(a.orderId);
  if (o && o.state === 'payment_review' && !(await attemptsFor(o.id)).some((x) => x.status === 'submitted'))
    await move(o.id, 'awaiting_payment', { actorId: financeId, event: 'payment_rejected', meta: { attempt: a.id } });
  if (o) await notify(o.buyerId, 'payment_rejected', { title: o.title, reason: why });
  return { ok: true, value: done };
}

/*
 * Finance refunds an order that was paid but not yet accepted (owner decision F-5). The order is cancelled through the machine; the ledger
 * moves the escrow to "owed back" for manual payments (paid by hand, recorded below) or the payment provider is asked for gateway payments.
 */
export async function refundOrder(financeId: string | null, orderId: string, reason: string, now = Date.now()): Promise<Result<Refund | null>> {
  const why = reason.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters).');
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (!['funded', 'release_pending', 'in_delivery', 'overdue'].includes(o.state))
    return fail(409, `An order that is ${o.state.replace('_', ' ')} cannot be refunded here. Use Disputes for delivered orders.`);
  await auditStrict(financeId, 'order_refund', 'order', o.id, { reason: why, amount: o.priceCents });
  const r = await cancel(o.id, financeId, `refunded by Finance: ${why}`);
  if (!r.ok) return fail(r.status, r.error);
  const manual = o.payment?.ref?.startsWith(MANUAL_REF) === true;
  if (!manual) {
    await refundAtProvider(r.order);
    await notify(o.buyerId, 'refund_issued', { title: o.title, amount: usd(o.priceCents), note: 'It was sent back through the payment provider.' });
    return { ok: true, value: null };
  }
  const rf = await insertRefund({
    id: crypto.randomUUID(),
    orderId: o.id,
    attemptId: null,
    kind: 'order',
    amountCents: o.priceCents,
    reason: why,
    status: 'approved',
    requestedBy: financeId,
    approvedBy: financeId,
    paidMethod: null,
    paidRef: null,
    paidAt: null,
  });
  await logPayment({ refundId: rf.id, orderId: o.id, actorId: financeId, event: 'refund_approved', detail: { amount: o.priceCents, kind: 'order' }, at: now });
  return { ok: true, value: rf };
}

export async function approveRefund(financeId: string | null, refundId: string, now = Date.now()): Promise<Result<Refund>> {
  const rf = await getRefund(refundId);
  if (!rf) return fail(404, 'Refund not found.');
  if (rf.status !== 'requested') return fail(409, 'This refund is not waiting for approval.');
  await auditStrict(financeId, 'refund_approved', 'refund', rf.id, { order: rf.orderId, amount: rf.amountCents });
  const next = await updateRefund(rf, { status: 'approved', approvedBy: financeId });
  await logPayment({ refundId: rf.id, orderId: rf.orderId, actorId: financeId, event: 'refund_approved', detail: { amount: rf.amountCents }, at: now });
  return { ok: true, value: next };
}

/* Finance records that the money went back (by which method, with which reference). Only then is the "owed back" balance cleared. */
export async function markRefundPaid(financeId: string | null, refundId: string, input: { method?: string; reference?: string }, now = Date.now()): Promise<Result<Refund>> {
  const rf = await getRefund(refundId);
  if (!rf) return fail(404, 'Refund not found.');
  if (rf.status !== 'approved') return fail(409, 'Approve the refund before recording it as paid.');
  const method = (input.method ?? '').trim(),
    ref = (input.reference ?? '').trim();
  if (method.length < 2 || method.length > 80) return fail(400, 'Say how the money was sent back.');
  if (ref.length < 3 || ref.length > 120) return fail(400, 'Enter the reference of the refund payment.');
  await auditStrict(financeId, 'refund_paid', 'refund', rf.id, { order: rf.orderId, amount: rf.amountCents, method, reference: ref });
  const next = await updateRefund(rf, { status: 'paid', paidMethod: method, paidRef: ref, paidAt: now });
  await (await ledgerStore()).post(refundPaid(rf.orderId, rf.id, rf.amountCents));
  await logPayment({ refundId: rf.id, orderId: rf.orderId, actorId: financeId, event: 'refund_paid', detail: { amount: rf.amountCents, method }, at: now });
  const o = await getOrder(rf.orderId);
  if (o) await notify(o.buyerId, 'refund_issued', { title: o.title, amount: usd(rf.amountCents), note: `Sent by ${method}.` });
  return { ok: true, value: next };
}

export async function cancelRefund(financeId: string | null, refundId: string, reason: string): Promise<Result<Refund>> {
  const rf = await getRefund(refundId);
  if (!rf) return fail(404, 'Refund not found.');
  if (rf.status !== 'requested') return fail(409, 'Only a refund waiting for approval can be cancelled.');
  if (reason.trim().length < 5) return fail(400, 'Write why (at least 5 characters).');
  await auditStrict(financeId, 'refund_cancelled', 'refund', rf.id, { reason });
  return { ok: true, value: await updateRefund(rf, { status: 'cancelled' }) };
}

export { listRefunds, orderCode };
