import { CONFIG, HOUR_MS } from '../config';

/*
 * The release gate (owner decision D-A) and the 12-hour release target (24/7/365, UTC; owner decision). Pure, tested.
 * Nothing in this file has a switch: payment verification and admin release approval are mandatory controls.
 */

/* States in which a buyer of a quotation order may download, once released. A dispute suspends access (the entitlement), a refund ends it. */
export const RELEASED_STATES = ['delivered', 'accepted', 'payout_pending', 'paid_out', 'fix_requested'] as const;
/* Legacy orders (made before SellOnBay 2.0) that were paid but not delivered: held for individual review (F-13). */
export const LEGACY_REVIEW_STATES = ['funded', 'in_delivery', 'overdue', 'release_pending'] as const;

export type EntitlementState = 'active' | 'suspended' | 'revoked';
export type GateInput = { status: string; quotationId?: string | null; releaseApprovedAt?: number | null; entitlement?: EntitlementState | null };
export type GateDecision = { allowed: true } | { allowed: false; reason: 'not_released' | 'awaiting_review' | 'suspended' | 'revoked' | 'not_funded' };

/*
 * May files, a licence key or a repository invite reach the buyer of this order now?
 *  - quotation orders: only after an explicit admin release approval, in a released state, with an active entitlement
 *  - legacy orders paid but not delivered: only after an admin's individual review (recorded as a release approval)
 *  - legacy orders already delivered keep the access they had (their licences are preserved)
 * The existing funded/delay rules (lib/delivery/policy.ts) still apply on top for legacy orders.
 */
export function releaseGate(i: GateInput): GateDecision {
  if (i.quotationId) {
    if (!i.releaseApprovedAt || !(RELEASED_STATES as readonly string[]).includes(i.status)) return { allowed: false, reason: 'not_released' };
    if (i.entitlement === 'revoked') return { allowed: false, reason: 'revoked' };
    if (i.entitlement !== 'active') return { allowed: false, reason: 'suspended' };
    return { allowed: true };
  }
  if ((LEGACY_REVIEW_STATES as readonly string[]).includes(i.status) && !i.releaseApprovedAt) return { allowed: false, reason: 'awaiting_review' };
  if (i.entitlement === 'revoked') return { allowed: false, reason: 'revoked' };
  return { allowed: true };
}

export const GATE_TEXT: Record<Exclude<GateDecision, { allowed: true }>['reason'], string> = {
  not_released: 'Your payment is verified. SellOnBay is checking the files and will release them soon.',
  awaiting_review: 'SellOnBay is reviewing this order before the files are released. You will be told as soon as they are.',
  suspended: 'Access to these files is paused while an issue on the order is resolved.',
  revoked: 'Access to these files has ended for this order.',
  not_funded: 'Your files are available after your payment is verified and released.',
};

/* ---------- the 12-hour target ---------- */
export const releaseDueAt = (paymentVerifiedAt: number, filesReadyAt: number) => Math.max(paymentVerifiedAt, filesReadyAt) + CONFIG.release.slaHours * HOUR_MS;

export type SlaState = 'on_track' | 'due_soon' | 'overdue';
/* Due soon = less than a quarter of the target left. Overdue never releases anything; it only raises alerts. */
export function slaState(dueAt: number, now: number): SlaState {
  if (now >= dueAt) return 'overdue';
  if (dueAt - now <= (CONFIG.release.slaHours * HOUR_MS) / 4) return 'due_soon';
  return 'on_track';
}
