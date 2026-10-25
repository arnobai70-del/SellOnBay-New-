import 'server-only';
import { audit } from './admin/audit';
import { HELD_TEXT, heldReason, heldSince, holdReasonFor, listHolds, markDecided, maybeHold, type Hold } from './holdStore';
import { notify } from './notify';
import { cancel, getOrder, refundAtProvider } from './orders/service';
import { orderStore } from './orders/store';

export { HELD_TEXT, heldReason, heldSince, holdReasonFor, listHolds, maybeHold, type Hold };
export type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

/*
 * The admin's decision on an order held for a safety check (the rules and the storage are in lib/holdStore.ts).
 * Release: the delivery timer starts again with the time it had left when the hold began, and the seller is told to start.
 * Cancel: the buyer is refunded from escrow and the seller is told.
 */
export async function decideHold(adminId: string | null, orderId: string, decision: 'release' | 'cancel', note: string, now = Date.now()): Promise<Result> {
  const why = note.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the note under 500 characters.');
  const since = await heldSince(orderId);
  if (since === null) return fail(404, 'No order on hold like that.');
  const outcome = decision === 'release' ? 'released' : 'cancelled';
  const o = await getOrder(orderId);
  if (decision === 'cancel') {
    const r = await cancel(orderId, adminId, `safety check: ${why}`);
    if (!r.ok) return fail(r.status, r.error);
    if (o?.fundedAt) await refundAtProvider(o); // the ledger gives the escrow back; the card is refunded here
  }
  if (!(await markDecided(orderId, outcome, adminId, why))) return fail(409, 'This hold was just decided.');
  const pausedMs = Math.max(0, now - since);
  if (decision === 'release' && o?.dueAt !== undefined) {
    // The delivery timer stood still while the order was held: give the seller the time back.
    const fresh = (await getOrder(orderId)) ?? o;
    await (await orderStore()).patch(fresh, { ...fresh, dueAt: o.dueAt + pausedMs });
  }
  if (o) await notify(o.sellerId, 'order_hold_decided', { title: o.title, orderId: o.id, decision: outcome });
  await audit(adminId, `hold_${outcome}`, 'order', orderId, { note: why, pausedMs });
  return { ok: true };
}
