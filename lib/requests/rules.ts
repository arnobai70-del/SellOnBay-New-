import { CONFIG, DAY_MS } from '../config';
import { LICENCE_TEXT_VERSION, isRequestedTier, type RequestedTier } from '../licenceTiers';
import { LINE_KINDS, commissionFor, type LineKind, type Plan, type PricedLine } from '../plans/rules';

/*
 * Purchase requests and quotations (owner decision D-E; O-8, O-13). Pure, so every rule is tested; storage is lib/requests/store.ts.
 *   Purchase Request -> Admin Quotation -> Buyer Acceptance -> Order -> Verified Payment -> Admin Release Approval -> Buyer Entitlement
 * The browser never sets a price: a quotation's lines are written by an admin; a request only says what the buyer wants.
 */

/* ---------- requests ---------- */
export const REQUEST_STATES = ['submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted', 'converted', 'declined', 'withdrawn', 'expired'] as const;
export type RequestState = (typeof REQUEST_STATES)[number];
export const REQUEST_MOVES: Record<RequestState, readonly RequestState[]> = {
  submitted: ['under_review', 'declined', 'withdrawn'],
  under_review: ['needs_info', 'requirements_verified', 'quoted', 'declined', 'withdrawn', 'expired'],
  needs_info: ['under_review', 'withdrawn', 'expired', 'declined'],
  requirements_verified: ['quoted', 'under_review', 'declined', 'withdrawn', 'expired'],
  quoted: ['converted', 'under_review', 'withdrawn'],
  converted: [],
  declined: [],
  withdrawn: [],
  expired: [],
};
export const mayMoveRequest = (from: RequestState, to: RequestState) => REQUEST_MOVES[from].includes(to);
export const OPEN_REQUEST_STATES: readonly RequestState[] = ['submitted', 'under_review', 'needs_info', 'requirements_verified', 'quoted'];

export type RequestKind = 'product' | 'custom_dev';
export type Package = 'asis' | 'setup' | 'custom';
export type DeliveryDetails = { domain?: string; appName?: string; oses?: string[]; github?: string };
export type Business = { company?: string; country?: string; taxId?: string };
export type RequestInput = {
  licenceTier: unknown;
  package: unknown;
  intendedUse: unknown;
  requirements?: unknown;
  express?: unknown;
  hosting?: unknown;
  delivery?: { domain?: unknown; appName?: unknown; oses?: unknown; github?: unknown };
  business?: { company?: unknown; country?: unknown; taxId?: unknown };
  consent: unknown;
};
export type CleanRequest = {
  licenceTier: RequestedTier;
  package: Package;
  intendedUse: string;
  requirements: string | null;
  extras: { express: boolean; hosting: boolean };
  delivery: DeliveryDetails;
  business: Business;
  consentVersion: string;
};

/* The words the buyer agrees to when sending a request. The version goes on the request. [LAWYER REVIEW] */
export const REQUEST_CONSENT_VERSION = '2026-10-27-draft';
export const REQUEST_CONSENT_TEXT =
  'I understand that this is a request, not a purchase. SellOnBay will review it and may send a quotation. Nothing is charged until I accept a quotation, and files are released only after my payment is verified and SellOnBay approves the release.';

const DOMAIN = /^(?=.{4,80}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const GITHUB = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const OSES = ['Windows', 'macOS', 'Linux'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const noMarkup = (s: string) => !/[<>]/.test(s);
/* Contact details are not allowed in what buyers write (admin-mediated communication, D-B). */
const CONTACT = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(\+?\d[\d\s().-]{7,}\d)|(wa\.me|t\.me\/|whatsapp|telegram|skype:)/i;

export function checkRequest(i: RequestInput, kind: RequestKind = 'product'): { ok: true; value: CleanRequest } | { ok: false; error: string } {
  if (i.consent !== true) return { ok: false, error: 'Tick the box to confirm you understand how requests work.' };
  if (!isRequestedTier(i.licenceTier)) return { ok: false, error: 'Choose a licence.' };
  const pkg = i.package === 'setup' || i.package === 'custom' ? i.package : i.package === 'asis' || i.package === undefined ? 'asis' : null;
  if (!pkg) return { ok: false, error: 'Choose how you want it delivered.' };
  const intendedUse = str(i.intendedUse, 1000);
  if (intendedUse.length < 10) return { ok: false, error: 'Tell us how you will use it (at least 10 characters).' };
  const requirements = str(i.requirements, kind === 'custom_dev' ? 4000 : 4000);
  if (kind === 'custom_dev' && requirements.length < 50) return { ok: false, error: 'Describe what you need built (at least 50 characters).' };
  for (const t of [intendedUse, requirements]) {
    if (!noMarkup(t)) return { ok: false, error: 'Leave out < and > in what you write.' };
    if (CONTACT.test(t)) return { ok: false, error: 'Please do not include email addresses, phone numbers or messenger links. SellOnBay handles all communication.' };
  }
  const d = i.delivery ?? {};
  const domain = str(d.domain, 80)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (domain && !DOMAIN.test(domain)) return { ok: false, error: 'Enter your domain like mybusiness.com, or leave it empty.' };
  const appName = str(d.appName, 30);
  const oses = Array.isArray(d.oses) ? [...new Set(d.oses.filter((o): o is string => typeof o === 'string' && OSES.includes(o)))] : [];
  const github = str(d.github, 39).replace(/^@/, '');
  if (github && !GITHUB.test(github)) return { ok: false, error: 'Enter a GitHub username like octocat, or leave it empty.' };
  const b = i.business ?? {};
  const company = str(b.company, 120);
  const country = str(b.country, 2).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return { ok: false, error: 'Use a two-letter country code, like BD or US.' };
  const taxId = str(b.taxId, 40);
  if (![appName, company, taxId].every(noMarkup)) return { ok: false, error: 'Leave out < and > in what you write.' };
  return {
    ok: true,
    value: {
      licenceTier: i.licenceTier,
      package: pkg,
      intendedUse,
      requirements: requirements || null,
      extras: { express: i.express === true, hosting: i.hosting === true },
      delivery: { ...(domain ? { domain } : {}), ...(appName ? { appName } : {}), ...(oses.length ? { oses } : {}), ...(github ? { github } : {}) },
      business: { ...(company ? { company } : {}), ...(country ? { country } : {}), ...(taxId ? { taxId } : {}) },
      consentVersion: REQUEST_CONSENT_VERSION,
    },
  };
}

/* ---------- quotations ---------- */
export const QUOTE_STATES = ['draft', 'pending_super', 'issued', 'accepted', 'rejected', 'superseded', 'expired', 'withdrawn', 'discarded'] as const;
export type QuoteState = (typeof QUOTE_STATES)[number];
export const QUOTE_MOVES: Record<QuoteState, readonly QuoteState[]> = {
  draft: ['pending_super', 'issued', 'discarded'],
  pending_super: ['issued', 'draft'],
  issued: ['accepted', 'rejected', 'superseded', 'expired', 'withdrawn'],
  accepted: [],
  rejected: [],
  superseded: [],
  expired: [],
  withdrawn: [],
  discarded: [],
};
export const mayMoveQuote = (from: QuoteState, to: QuoteState) => QUOTE_MOVES[from].includes(to);

/* An issued quotation can be accepted for 7 days (O-13). */
export const validUntil = (issuedAt: number) => issuedAt + CONFIG.quotation.validDays * DAY_MS;

/* What the listing itself costs for this choice, line by line: the reference every quotation is compared with (O-8). */
export type ListingPrice = { priceCents: number; setupCents: number | null; customCents: number | null; expressCents: number | null; expressHelps: boolean; name: string };
export function listedLines(p: ListingPrice, pkg: Package, extras: { express: boolean; hosting: boolean }): PricedLine[] {
  const lines: PricedLine[] = [{ label: p.name, cents: p.priceCents, kind: 'product' }];
  if (pkg === 'setup' && p.setupCents) lines.push({ label: 'Setup help', cents: p.setupCents, kind: 'package' });
  if (pkg === 'custom' && p.customCents) lines.push({ label: 'Customisation', cents: p.customCents, kind: 'package' });
  if (extras.express && p.expressCents && p.expressHelps) lines.push({ label: `Express delivery (${CONFIG.delivery.expressHours} hours)`, cents: p.expressCents, kind: 'express' });
  if (extras.hosting) lines.push({ label: 'Managed hosting, first month', cents: CONFIG.extras.hostingMonthCents, kind: 'hosting' });
  return lines;
}
/* The listed seller amount (product, package, express): what the quotation's seller lines are compared with. Pass-through lines are costs. */
export const listedSellerCents = (lines: readonly PricedLine[]) => lines.filter((l) => l.kind !== 'domain' && l.kind !== 'hosting').reduce((s, l) => s + l.cents, 0);

/* Checks the lines an admin wrote. */
export function checkLines(raw: unknown): { ok: true; lines: PricedLine[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) return { ok: false, error: 'A quotation has 1 to 20 lines.' };
  const lines: PricedLine[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const label = str(r?.label, 120);
    const cents = Number(r?.cents);
    const kind = r?.kind as LineKind;
    if (label.length < 2 || !noMarkup(label)) return { ok: false, error: 'Every line needs a short name without < or >.' };
    if (!Number.isInteger(cents) || cents < 0 || cents > 100_000_000) return { ok: false, error: `"${label}": the amount must be whole cents.` };
    if (!(LINE_KINDS as readonly string[]).includes(kind)) return { ok: false, error: `"${label}": choose what kind of line it is.` };
    lines.push({ label, cents, kind, ...(kind === 'domain' || kind === 'hosting' ? { passThroughVerified: r?.passThroughVerified === true } : {}) });
  }
  if (lines.reduce((s, l) => s + l.cents, 0) <= 0) return { ok: false, error: 'The total must be more than zero.' };
  return { ok: true, lines };
}

/*
 * Does this quotation need Super Admin approval? Every difference from the listed price, up or down, does (O-8). A tier other than the
 * listing's single-project price, a custom development job, or an exclusive request has no listed price at all, so it always does.
 */
export function needsSuperApproval(lines: readonly PricedLine[], listed: readonly PricedLine[] | null): boolean {
  if (!listed) return true;
  return listedSellerCents(lines) !== listedSellerCents(listed);
}

/* The terms the buyer accepts with the quotation. Stored on the quotation and the order; never changed afterwards. */
export type QuoteTerms = {
  licenceTier: RequestedTier;
  licenceTextVersion: string;
  deliveryDays: number;
  deliveryHours?: number;
  supportDays: number;
  updateDays: number;
  revisions: { included: number; windowDays: number; scope: string; extraPriceCents: number | null };
  refundTermsVersion: string;
  exclusive?: { approvedBy: string; legalReview: string };
  note?: string;
};
export function checkTerms(raw: Record<string, unknown>, tier: RequestedTier): { ok: true; terms: QuoteTerms } | { ok: false; error: string } {
  const n = (v: unknown) => Number(v);
  const days = n(raw.deliveryDays);
  if (!Number.isInteger(days) || days < 1 || days > 60) return { ok: false, error: 'Delivery takes 1 to 60 days.' };
  const hours = raw.deliveryHours === undefined || raw.deliveryHours === null || raw.deliveryHours === '' ? undefined : n(raw.deliveryHours);
  if (hours !== undefined && (!Number.isInteger(hours) || hours < 1 || hours > 24 * 60)) return { ok: false, error: 'Delivery in hours must be a whole number.' };
  const supportDays = n(raw.supportDays ?? 0),
    updateDays = n(raw.updateDays ?? 0);
  if (![supportDays, updateDays].every((x) => Number.isInteger(x) && x >= 0 && x <= 730)) return { ok: false, error: 'Support and updates last 0 to 730 days.' };
  const rv = (raw.revisions ?? {}) as Record<string, unknown>;
  const included = n(rv.included ?? 0),
    windowDays = n(rv.windowDays ?? 0);
  if (!Number.isInteger(included) || included < 0 || included > 50) return { ok: false, error: 'Included revisions: 0 to 50.' };
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 365) return { ok: false, error: 'Revision window: 0 to 365 days.' };
  const scope = str(rv.scope, 1000);
  const extra = rv.extraPriceCents === undefined || rv.extraPriceCents === null || rv.extraPriceCents === '' ? null : n(rv.extraPriceCents);
  if (extra !== null && (!Number.isInteger(extra) || extra < 0)) return { ok: false, error: 'The price of an extra revision is whole cents, or empty.' };
  if (included > 0 && scope.length < 5) return { ok: false, error: 'Describe what counts as a revision.' };
  const note = str(raw.note, 1000);
  let exclusive: QuoteTerms['exclusive'];
  if (tier === 'exclusive_review') {
    const legal = str(raw.legalReview, 500);
    if (legal.length < 10) return { ok: false, error: 'Exclusive rights need a recorded legal/IP review (who checked, and what about earlier buyers).' };
    exclusive = { approvedBy: '', legalReview: legal };
  }
  return {
    ok: true,
    terms: {
      licenceTier: tier,
      licenceTextVersion: LICENCE_TEXT_VERSION,
      deliveryDays: days,
      ...(hours ? { deliveryHours: hours } : {}),
      supportDays,
      updateDays,
      revisions: { included, windowDays, scope, extraPriceCents: extra },
      refundTermsVersion: REQUEST_CONSENT_VERSION,
      ...(exclusive ? { exclusive } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/* The money of a quotation under the seller's plan at the time it is written (D-F, O-1, O-2). */
export const quoteMoney = (lines: readonly PricedLine[], plan: Plan, ownerType: 'seller' | 'platform') => commissionFor(lines, plan, ownerType);

/* May this buyer accept this quotation now? */
export function acceptProblem(q: { status: QuoteState; validUntil: number | null; buyerId: string }, buyerId: string, now: number): string | null {
  if (q.buyerId !== buyerId) return 'This quotation is not yours.';
  if (q.status === 'accepted') return null;
  if (q.status !== 'issued') return 'This quotation can no longer be accepted.';
  if (!q.validUntil || q.validUntil <= now) return 'This quotation has expired. Ask SellOnBay for a new one.';
  return null;
}
