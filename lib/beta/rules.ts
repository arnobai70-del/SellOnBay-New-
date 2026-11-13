import { tx } from '../i18n/tx';
/*
 * The free beta (owner, 2026-11-07). Pure and tested; safe in the browser. Storage and emails are in lib/beta/service.ts.
 * Only the Standard licence of a listing marked for the beta can be requested: SellOnBay's own listings, and sellers' listings they opted in.
 */
export const BETA_METHOD = 'beta_free';
export const BETA_FEEDBACK_DAYS = 7;
export const BETA_CART_LIMIT = 5;

export const betaEligible = (p: { ownerType?: string; betaFreeOk?: boolean }) => p.ownerType === 'platform' || p.betaFreeOk === true;

export type BetaInput = { name: string; email: string; country: string; company: string; useFor: string; domain: string };
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;

export function checkBetaInput(raw: Partial<Record<keyof BetaInput, unknown>>): { ok: true; value: BetaInput } | { ok: false; error: string } {
  const v: BetaInput = {
    name: clean(raw.name),
    email: clean(raw.email),
    country: clean(raw.country).toUpperCase(),
    company: clean(raw.company),
    useFor: clean(raw.useFor),
    domain: clean(raw.domain).toLowerCase(),
  };
  if (v.name.length < 1 || v.name.length > 100) return { ok: false, error: tx('Enter your name.') };
  if (!EMAIL.test(v.email) || v.email.length > 254) return { ok: false, error: tx('Enter a valid email address.') };
  if (!/^[A-Z]{2}$/.test(v.country)) return { ok: false, error: tx('Choose your country.') };
  if (v.company.length > 120) return { ok: false, error: tx('Keep the company name under 120 characters.') };
  if (v.useFor.length < 3 || v.useFor.length > 1000) return { ok: false, error: tx('Tell us what you will use it for.') };
  if (v.domain && (v.domain.length > 253 || !DOMAIN.test(v.domain))) return { ok: false, error: tx('Enter a domain like yourbrand.com, or leave it empty.') };
  return { ok: true, value: v };
}

export type BetaFeedback = { rating: number; worked: string; improve: string };
export function checkFeedback(raw: Partial<Record<keyof BetaFeedback, unknown>>): { ok: true; value: BetaFeedback } | { ok: false; error: string } {
  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: tx('Choose a rating from 1 to 5.') };
  const worked = clean(raw.worked);
  const improve = clean(raw.improve);
  if (worked.length > 2000 || improve.length > 2000) return { ok: false, error: tx('Please keep each answer under 2000 characters.') };
  return { ok: true, value: { rating, worked, improve } };
}

/* Which approved requests are due for the feedback email. */
export const feedbackDue = (r: { decidedAt?: number; approved: boolean; feedbackSentAt?: number }, now: number) =>
  r.approved && !r.feedbackSentAt && r.decidedAt !== undefined && now - r.decidedAt >= BETA_FEEDBACK_DAYS * 86_400_000;
