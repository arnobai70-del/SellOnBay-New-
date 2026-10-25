import 'server-only';
import { isBlocked } from './chatFilter';
import { CONFIG, DAY_MS, HOUR_MS } from './config';
import { split } from './ledger';
import { move, getOrder, chargeSellerFee } from './orders/service';
import { orderStore } from './orders/store';
import type { Order } from './orders/machine';
import { notify } from './notify';
import { createAdminClient } from './supabase/server';
import { bump } from './metrics';

/*
 * Disputes. The buyer opens one during the review window or the bug-fix window, with a reason and evidence. Payment for that order is held
 * (the order is "disputed": no auto-accept, no payout step). The seller replies within 48 hours, an admin decides within 5 days:
 * refund (full or partial), ask the seller to fix, or release the payout. The decision moves the order and the ledger and is written to the order history.
 * Three rejected disputes (verdict "release") flag the buyer's account.
 */
export const DISPUTE_REASONS = ['not_as_described', 'not_working', 'malware', 'copyright', 'other'] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export const REASON_LABEL: Record<DisputeReason, string> = {
  not_as_described: 'Not as described',
  not_working: 'Does not work',
  malware: 'Harmful code',
  copyright: 'Copyright problem',
  other: 'Something else',
};
export type DisputeStatus = 'open' | 'seller_replied' | 'decided';
export type Decision = 'refund_full' | 'refund_partial' | 'fix_requested' | 'release';
/* Whose fault it was, written on every decided dispute: the seller, the buyer (fraud), or neither (us or nobody). */
export type Liability = 'seller' | 'buyer_fraud' | 'platform';
export const LIABILITY_LABEL: Record<Liability, string> = { seller: 'The seller', buyer_fraud: 'The buyer (fraud)', platform: 'Us or nobody' };

export type Dispute = {
  id: string;
  orderId: string;
  openedBy: string | null;
  reason: DisputeReason;
  detail: string;
  status: DisputeStatus;
  fromState: 'delivered' | 'accepted';
  sellerReply?: string;
  sellerRepliedAt?: number;
  sellerDueAt: number;
  adminDueAt: number;
  decision?: Decision;
  refundCents?: number;
  liability?: Liability;
  feeCents?: number; // the fee the dispute cost (set by the admin; no amount is assumed)
  feeChargedCents?: number; // the part of it taken from the seller (only when the seller was at fault)
  decidedBy?: string | null;
  decidedAt?: number;
  createdAt: number;
};
export type Evidence = { id: string; disputeId: string; authorId: string | null; text: string; at: number };

/* ---------- storage: the database when the orders are there, memory otherwise ---------- */
type Mem = { disputes: Map<string, Dispute>; evidence: Evidence[]; rejected: Map<string, number> };
const mem: Mem = ((globalThis as { __disputeMem?: Mem }).__disputeMem ??= { disputes: new Map(), evidence: [], rejected: new Map() });
const pg = async () => (await orderStore()).kind === 'postgres';
const iso = (n?: number) => (n === undefined ? null : new Date(n).toISOString());
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : undefined);
type Row = Record<string, unknown>;
const fromRow = (r: Row): Dispute => ({
  id: r.id as string,
  orderId: r.order_id as string,
  openedBy: (r.opened_by as string) ?? null,
  reason: r.reason as DisputeReason,
  detail: (r.detail as string) ?? '',
  status: r.status as DisputeStatus,
  fromState: (r.from_state as Dispute['fromState']) ?? 'delivered',
  sellerReply: (r.seller_reply as string) ?? undefined,
  sellerRepliedAt: ms(r.seller_replied_at),
  sellerDueAt: ms(r.seller_due_at) ?? 0,
  adminDueAt: ms(r.admin_due_at) ?? 0,
  decision: (r.decision as Decision) ?? undefined,
  refundCents: (r.refund_cents as number) ?? undefined,
  liability: (r.liability as Liability) ?? undefined,
  feeCents: (r.fee_cents as number) || undefined,
  feeChargedCents: (r.fee_charged_cents as number) || undefined,
  decidedBy: (r.decided_by as string) ?? undefined,
  decidedAt: ms(r.decided_at),
  createdAt: ms(r.created_at) ?? 0,
});

export async function getDispute(id: string): Promise<Dispute | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('disputes').select('*').eq('id', id).maybeSingle();
    return data ? fromRow(data) : null;
  }
  return mem.disputes.get(id) ?? null;
}
export async function disputesForOrder(orderId: string): Promise<Dispute[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('disputes').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
    return (data ?? []).map(fromRow);
  }
  return [...mem.disputes.values()].filter((d) => d.orderId === orderId).sort((a, b) => a.createdAt - b.createdAt);
}
/* The admin queue: open and replied disputes first, oldest first. */
export async function openDisputes(): Promise<Dispute[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('disputes').select('*').neq('status', 'decided').order('created_at', { ascending: true }).limit(200);
    return (data ?? []).map(fromRow);
  }
  return [...mem.disputes.values()].filter((d) => d.status !== 'decided').sort((a, b) => a.createdAt - b.createdAt);
}
export async function evidenceOf(disputeId: string): Promise<Evidence[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('dispute_evidence').select('id, dispute_id, author_id, text, created_at').eq('dispute_id', disputeId).order('created_at', { ascending: true });
    return (data ?? []).map((r) => ({ id: r.id, disputeId: r.dispute_id, authorId: r.author_id, text: r.text, at: Date.parse(r.created_at) }));
  }
  return mem.evidence.filter((e) => e.disputeId === disputeId);
}

export type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

async function addEvidence(d: Dispute, authorId: string | null, text: string): Promise<void> {
  const e: Evidence = { id: crypto.randomUUID(), disputeId: d.id, authorId, text, at: Date.now() };
  if (await pg()) {
    if (authorId)
      await createAdminClient()
        .from('dispute_evidence')
        .insert({ id: e.id, dispute_id: d.id, author_id: authorId, text, created_at: iso(e.at) });
    return; // evidence by an anonymous (demo) buyer is kept in the dispute detail only
  }
  mem.evidence.push(e);
}

const checkText = (text: string, min: number, what: string): string | null => {
  const t = text.trim();
  if (t.length < min || t.length > 2000) return `Write ${min} to 2000 characters for ${what}.`;
  if (isBlocked(t)) return 'Keep emails, phone numbers and outside payment talk out of a dispute. Everything is decided here.';
  return null;
};

/* Can a dispute be opened now? Only in the review window (delivered) or the bug-fix window (accepted, before the window ends). */
export function disputeWindow(o: Order, now = Date.now()): 'delivered' | 'accepted' | null {
  if (o.state === 'delivered' && (o.reviewEndsAt ?? 0) > now) return 'delivered';
  if (o.state === 'accepted' && (o.bugfixUntil ?? 0) > now) return 'accepted';
  return null;
}

export async function openDispute(orderId: string, buyerId: string | null, i: { reason: string; detail: string }, now = Date.now()): Promise<R<Dispute>> {
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (!(DISPUTE_REASONS as readonly string[]).includes(i.reason)) return fail(400, 'Pick a reason.');
  const bad = checkText(i.detail, 20, 'what is wrong (screenshots or steps help)');
  if (bad) return fail(400, bad);
  const from = disputeWindow(o, now);
  if (!from) return fail(409, 'A dispute can be opened while you are reviewing the order, or in the 7 days after you accept it.');
  if ((await disputesForOrder(orderId)).some((d) => d.status !== 'decided')) return fail(409, 'There is already a dispute open for this order.');

  const d: Dispute = {
    id: crypto.randomUUID(),
    orderId,
    openedBy: buyerId,
    reason: i.reason as DisputeReason,
    detail: i.detail.trim(),
    status: 'open',
    fromState: from,
    sellerDueAt: now + CONFIG.dispute.sellerReplyHours * HOUR_MS,
    adminDueAt: now + CONFIG.dispute.adminDecisionDays * DAY_MS,
    createdAt: now,
  };
  // The order is held first: if two disputes race, only one can move it.
  const held = await move(orderId, 'disputed', { actorId: buyerId, event: 'dispute_opened', meta: { disputeId: d.id, reason: d.reason, from }, now });
  if (!held.ok) return fail(held.status, held.error);
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('disputes')
      .insert({
        id: d.id,
        order_id: orderId,
        opened_by: buyerId,
        reason: d.reason,
        detail: d.detail,
        status: 'open',
        from_state: from,
        seller_due_at: iso(d.sellerDueAt),
        admin_due_at: iso(d.adminDueAt),
        created_at: iso(d.createdAt),
      });
    if (error) return fail(500, 'Could not save the dispute. Ask support, the order is held.');
  } else mem.disputes.set(d.id, d);
  await addEvidence(d, buyerId, d.detail);
  await bump('disputes', 1, now);
  return { ok: true, value: d };
}

async function save(d: Dispute, patch: Row): Promise<boolean> {
  if (await pg()) {
    const { data } = await createAdminClient().from('disputes').update(patch).eq('id', d.id).neq('status', 'decided').select('id');
    return (data?.length ?? 0) > 0;
  }
  const cur = mem.disputes.get(d.id);
  if (!cur || cur.status === 'decided') return false;
  return true;
}

export async function addEvidenceTo(disputeId: string, authorId: string | null, text: string): Promise<R<true>> {
  const d = await getDispute(disputeId);
  if (!d) return fail(404, 'Dispute not found.');
  if (d.status === 'decided') return fail(409, 'This dispute is already decided.');
  const bad = checkText(text, 5, 'your evidence');
  if (bad) return fail(400, bad);
  await addEvidence(d, authorId, text.trim());
  return { ok: true, value: true };
}

export async function sellerReply(disputeId: string, sellerId: string | null, text: string, now = Date.now()): Promise<R<Dispute>> {
  const d = await getDispute(disputeId);
  if (!d) return fail(404, 'Dispute not found.');
  if (d.status === 'decided') return fail(409, 'This dispute is already decided.');
  const bad = checkText(text, 10, 'your reply');
  if (bad) return fail(400, bad);
  const next: Dispute = { ...d, status: 'seller_replied', sellerReply: text.trim(), sellerRepliedAt: now };
  if (!(await save(d, { status: 'seller_replied', seller_reply: next.sellerReply, seller_replied_at: iso(now) }))) return fail(409, 'This dispute has just changed.');
  if (!(await pg())) mem.disputes.set(d.id, next);
  await addEvidence(d, sellerId, `Seller reply: ${next.sellerReply}`);
  const o = await getOrder(d.orderId);
  if (o) await notify(o.buyerId, 'dispute_reply', { title: o.title, orderId: o.id });
  return { ok: true, value: next };
}

/* Waiting too long: the seller did not reply in time, or the admin did not decide in time. For the queue to highlight. */
export const sellerOverdue = (d: Dispute, now = Date.now()) => d.status === 'open' && now > d.sellerDueAt;
export const adminOverdue = (d: Dispute, now = Date.now()) => d.status !== 'decided' && now > d.adminDueAt;

/*
 * The admin's decision. refund_full gives everything back (from escrow, or by reversing the release if the order was already accepted);
 * refund_partial gives back part of it from the seller's share and releases the rest; fix_requested sends it back to the seller;
 * release rejects the dispute and pays the seller as normal. The payment provider is told by the caller.
 */
export async function decide(
  disputeId: string,
  adminId: string | null,
  i: { decision: Decision; refundCents?: number; note?: string; liability?: Liability; feeCents?: number },
  now = Date.now(),
): Promise<R<{ dispute: Dispute; order: Order }>> {
  const d = await getDispute(disputeId);
  if (!d) return fail(404, 'Dispute not found.');
  if (d.status === 'decided') return fail(409, 'This dispute is already decided.');
  const o = await getOrder(d.orderId);
  if (!o || o.state !== 'disputed') return fail(409, 'The order is not held for a dispute.');
  const note = (i.note ?? '').trim().slice(0, 500);
  if (note && isBlocked(note)) return fail(400, 'Keep emails, phone numbers and outside payment talk out of the note.');

  const fee = i.feeCents ?? 0;
  if (!Number.isInteger(fee) || fee < 0 || fee > 100_000) return fail(400, 'The dispute fee must be from 0 to $1000.');
  if (fee > 0 && !i.liability) return fail(400, 'Say whose fault it was before you record a fee.');
  if (i.liability && !['seller', 'buyer_fraud', 'platform'].includes(i.liability)) return fail(400, 'Pick whose fault it was.');

  // A trial whose fee was already taken off a full job with the same developer: the buyer got that money back as the credit, so refunding the
  // trial too would pay it twice. Fix or release it; a problem with the full job is a dispute on that order.
  if (o.kind === 'trial' && (i.decision === 'refund_full' || i.decision === 'refund_partial') && (await (await orderStore()).creditClaimed(o.id)))
    return fail(409, 'This trial fee was already credited to a full order with the same developer, so it cannot be refunded as well. Ask for a fix or release it.');
  let refund: number | undefined;
  // One partial refund per order: a later dispute can still give back the rest (refund_full), never a second part on top.
  if (i.decision === 'refund_partial' && o.refundedCents > 0)
    return fail(409, `This order already had a partial refund of $${(o.refundedCents / 100).toFixed(2)}. Refund in full (it gives back the rest) or release.`);
  if (i.decision === 'refund_partial') {
    const { sellerNet } = split(o.lines, o.feeCents);
    refund = i.refundCents;
    if (!Number.isInteger(refund) || (refund as number) <= 0 || (refund as number) > sellerNet)
      return fail(400, `A partial refund must be more than zero and no more than the seller earns on this order ($${(sellerNet / 100).toFixed(2)}).`);
  }
  const meta = { disputeId: d.id, decision: i.decision, refundCents: refund ?? null, note, liability: i.liability ?? null, feeCents: fee };
  const moved =
    i.decision === 'refund_full'
      ? await move(o.id, 'refunded', { actorId: adminId, event: 'dispute_decided', meta, now })
      : i.decision === 'fix_requested'
        ? await move(o.id, 'fix_requested', { actorId: adminId, event: 'dispute_decided', meta, now })
        : await move(o.id, 'accepted', { actorId: adminId, event: 'dispute_decided', meta, now, patch: (x) => ({ ...x, refundedCents: refund ?? x.refundedCents }) });
  if (!moved.ok) return fail(moved.status, moved.error);

  // A fee the seller is at fault for is taken from the seller straight away (pending, reserve, available, then debt). Nobody else pays it.
  const charged = i.liability === 'seller' && fee > 0 ? await chargeSellerFee(moved.order, `dispute-fee:${d.id}`, `Dispute fee charged to the seller (dispute ${d.id})`, fee) : 0;
  const done: Dispute = {
    ...d,
    status: 'decided',
    decision: i.decision,
    refundCents: refund,
    liability: i.liability,
    feeCents: fee || undefined,
    feeChargedCents: charged || undefined,
    decidedBy: adminId,
    decidedAt: now,
  };
  const patch = {
    status: 'decided',
    decision: i.decision,
    refund_cents: refund ?? null,
    liability: i.liability ?? null,
    fee_cents: fee,
    fee_charged_cents: charged,
    decided_by: adminId,
    decided_at: iso(now),
    resolution: note || null,
  };
  if (!(await save(d, patch))) return fail(409, 'This dispute has just changed.');
  if (!(await pg())) mem.disputes.set(d.id, done);

  // A rejected dispute counts against the buyer. In the database a trigger adds the strike (three flag the account); in memory we only count.
  if (i.decision === 'release' && d.openedBy && !(await pg())) mem.rejected.set(d.openedBy, (mem.rejected.get(d.openedBy) ?? 0) + 1);
  // A buyer who was at fault (fraud) is flagged right away, so their next orders are held for a safety check.
  if (i.liability === 'buyer_fraud' && o.buyerId && (await pg())) await createAdminClient().from('profiles').update({ flagged: true }).eq('id', o.buyerId);
  return { ok: true, value: { dispute: done, order: moved.order } };
}
export const rejectedCount = (buyerId: string) => mem.rejected.get(buyerId) ?? 0;

/* What the order page needs: the latest dispute (if any) and whether a new one can be opened now. */
export async function disputeSummary(o: Order, now = Date.now()) {
  const all = await disputesForOrder(o.id);
  const last = all.at(-1);
  const open = all.some((d) => d.status !== 'decided');
  return {
    current: last ? { id: last.id, status: last.status, reason: last.reason, decision: last.decision, sellerDueAt: last.sellerDueAt } : undefined,
    canOpen: !open && disputeWindow(o, now) !== null,
  };
}
