import { tx } from './i18n/tx';
/*
 * Where a seller's earnings are sent: the method (bank, Payoneer or Wise, as allowed by migration 0021) and the account. Admins pay by hand
 * from the weekly CSV, so the account is plain text the seller writes (an IBAN and bank name, or the Payoneer or Wise email).
 * Pages only ever show the last four characters.
 */
export const PAYOUT_METHODS = [
  ['bank', 'Bank transfer'],
  ['payoneer', 'Payoneer'],
  ['wise', 'Wise'],
  ['paypal', 'PayPal'],
  ['bkash', 'bKash'],
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number][0];
const NAMES: Record<string, string> = Object.fromEntries(PAYOUT_METHODS);
/* bKash pays only inside Bangladesh, so only sellers whose profile country is BD see or may pick it (owner, 2026-11-07; migration 0079). */
export const payoutMethodsFor = (country: string | null | undefined) => PAYOUT_METHODS.filter(([m]) => m !== 'bkash' || country === 'BD');

export function checkPayoutDetails(method: unknown, account: unknown, country?: string | null): { ok: true; method: PayoutMethod; account: string } | { ok: false; error: string } {
  if (typeof method !== 'string' || !(method in NAMES)) return { ok: false, error: tx('Pick how you want to be paid.') };
  if (method === 'bkash' && country !== 'BD') return { ok: false, error: tx('bKash is only for sellers in Bangladesh. Set your country first, or pick another way.') };
  if (method === 'bkash') {
    const n = typeof account === 'string' ? account.replace(/[\s-]/g, '') : '';
    if (!/^(\+?880|0)1[3-9]\d{8}$/.test(n)) return { ok: false, error: tx('Write your bKash account number, for example 01712345678.') };
    return { ok: true, method: 'bkash', account: n };
  }
  const a = typeof account === 'string' ? account.replace(/\s+/g, ' ').trim() : '';
  if (/[\u0000-\u001f\u007f]/.test(typeof account === 'string' ? account.replace(/[\r\n\t]/g, ' ') : '')) return { ok: false, error: tx('Remove the special characters.') };
  if (a.length < 5 || a.length > 200) return { ok: false, error: tx('Write the account details in 5 to 200 characters.') };
  if ((method === 'payoneer' || method === 'wise' || method === 'paypal') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
    return { ok: false, error: `Write the email address of your ${NAMES[method]} account.` };
  if (method === 'bank' && !/\d{4}/.test(a)) return { ok: false, error: tx('Write the account number or IBAN, the bank name and the account holder.') };
  return { ok: true, method: method as PayoutMethod, account: a };
}

/* "Bank transfer, ending 3000" or "Wise, s•••@example.com": enough for the seller to recognise it, never the whole account. */
export function payoutLabel(method: string | null | undefined, account: string | null | undefined): string | null {
  if (!method || !account) return null;
  const at = account.lastIndexOf('@');
  const shown = at > 0 ? `${account[0]}•••${account.slice(at)}` : `ending ${account.replace(/\s+/g, '').slice(-4)}`;
  return `${NAMES[method] ?? method}, ${shown}`;
}
