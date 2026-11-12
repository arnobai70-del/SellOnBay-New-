import { tx } from '../i18n/tx';
import { checkMessage, BLOCKED_MESSAGE } from '../chatFilter';
import { DAY_MS } from '../config';

/*
 * Revisions (SellOnBay 2.0, Blueprint 5.6, F-11, placeholder P15). Pure, tested.
 *
 *   submitted --admin decides the kind--> assigned (defect, or an included change within the accepted terms)
 *             --> quoted (paid change or new feature: a linked custom development request, paid into escrow first)
 *             --> declined (outside the accepted terms)
 *   assigned --seller sends revised work--> release_pending --release approved--> delivered --buyer confirms--> closed
 *   release_pending --returned--> assigned
 *   delivered --buyer reports it is not done--> closed, plus a follow-up revision in assigned (never counted again; its own release)
 *
 * No universal free count: the order's accepted terms (the quotation snapshot of the product's approved policy) decide what is included.
 * Defects never use the allowance, and the bug-fix guarantee and legal warranties are never reduced by these rules.
 */
export type RevisionKind = 'defect' | 'included' | 'paid' | 'feature';
export type RevisionState = 'submitted' | 'declined' | 'quoted' | 'assigned' | 'release_pending' | 'delivered' | 'closed';
export type BuyerHint = 'defect' | 'change';
export const OPEN_REVISION: readonly RevisionState[] = ['submitted', 'assigned', 'release_pending'];

export const REVISION_MOVES: Record<RevisionState, readonly RevisionState[]> = {
  submitted: ['assigned', 'quoted', 'declined'],
  assigned: ['release_pending'],
  release_pending: ['delivered', 'assigned'],
  delivered: ['closed'],
  quoted: ['closed'],
  declined: [],
  closed: [],
};
export const canMove = (from: RevisionState, to: RevisionState) => REVISION_MOVES[from].includes(to);

/* A product's revision terms, proposed by its seller and approved by Catalog. The same shape is snapshotted on every quotation. */
export type PolicyInput = { included: number; windowDays: number; scope: string; extraPriceCents: number | null; supportTerms: string };
export function checkPolicy(raw: Partial<Record<keyof PolicyInput, unknown>>): { ok: true; value: PolicyInput } | { ok: false; error: string } {
  const included = Number(raw.included ?? 0);
  const windowDays = Number(raw.windowDays ?? 0);
  const scope = String(raw.scope ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const supportTerms = String(raw.supportTerms ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const extraRaw = raw.extraPriceCents;
  const extraPriceCents = extraRaw === undefined || extraRaw === null || extraRaw === '' ? null : Number(extraRaw);
  if (!Number.isInteger(included) || included < 0 || included > 50) return { ok: false, error: tx('Included revisions: 0 to 50.') };
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 365) return { ok: false, error: tx('Revision window: 0 to 365 days.') };
  if (included > 0 && windowDays < 1) return { ok: false, error: tx('Included revisions need a window of at least one day.') };
  if (included > 0 && scope.length < 5) return { ok: false, error: tx('Describe what counts as a revision.') };
  if (scope.length > 1000 || supportTerms.length > 1000) return { ok: false, error: tx('Keep the scope and support terms under 1,000 characters each.') };
  if (extraPriceCents !== null && (!Number.isInteger(extraPriceCents) || extraPriceCents < 0 || extraPriceCents > 1_000_000))
    return { ok: false, error: tx('The price of an extra revision is whole cents.') };
  if (![scope, supportTerms].every((t) => !t || checkMessage(t).ok)) return { ok: false, error: BLOCKED_MESSAGE };
  return { ok: true, value: { included, windowDays, scope, extraPriceCents, supportTerms } };
}

export function checkRequest(raw: { description?: unknown; hint?: unknown }): { ok: true; description: string; hint: BuyerHint } | { ok: false; error: string; blocked?: boolean } {
  const description = String(raw.description ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const hint: BuyerHint = raw.hint === 'defect' ? 'defect' : 'change';
  if (description.length < 20 || description.length > 4000) return { ok: false, error: tx('Describe what should change (20 to 4,000 characters).') };
  if (!checkMessage(description).ok) return { ok: false, error: BLOCKED_MESSAGE, blocked: true };
  return { ok: true, description, hint };
}

/* The accepted terms an order carries (QuoteTerms.revisions), and how much of the allowance is used. */
export type AcceptedRevisions = { included: number; windowDays: number; scope: string; extraPriceCents: number | null };
export const windowEndsAt = (releasedAt: number, t: AcceptedRevisions) => releasedAt + t.windowDays * DAY_MS;
export const allowanceLeft = (t: AcceptedRevisions, used: number) => Math.max(0, t.included - used);

/*
 * What an admin's decision on a submitted revision leads to. An included change must be inside the window and the allowance; outside them
 * the same change can still be done as a paid change. A defect is always taken (it is the seller's fault, not a change of scope).
 */
export function triage(
  kind: RevisionKind | 'decline',
  t: AcceptedRevisions | null,
  ctx: { used: number; releasedAt: number; now: number },
): { ok: true; to: RevisionState; counts: boolean } | { ok: false; error: string } {
  if (kind === 'decline') return { ok: true, to: 'declined', counts: false };
  if (kind === 'defect') return { ok: true, to: 'assigned', counts: false };
  if (kind === 'paid' || kind === 'feature') return { ok: true, to: 'quoted', counts: false };
  if (!t || t.included < 1) return { ok: false, error: tx('This order has no included revisions. Treat it as a paid change.') };
  if (ctx.now > windowEndsAt(ctx.releasedAt, t)) return { ok: false, error: tx('The revision window has ended. Treat it as a paid change.') };
  if (allowanceLeft(t, ctx.used) < 1) return { ok: false, error: tx('The included revisions are used up. Treat it as a paid change.') };
  return { ok: true, to: 'assigned', counts: true };
}

export const KIND_TEXT: Record<RevisionKind, string> = {
  defect: 'Defect (fixed free, never counted)',
  included: 'Included change (uses one included revision)',
  paid: 'Paid change (quoted, paid into escrow first)',
  feature: 'New feature (quoted, paid into escrow first)',
};
