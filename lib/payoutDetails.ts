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
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number][0];
const NAMES: Record<string, string> = Object.fromEntries(PAYOUT_METHODS);

export function checkPayoutDetails(method: unknown, account: unknown): { ok: true; method: PayoutMethod; account: string } | { ok: false; error: string } {
  if (typeof method !== 'string' || !(method in NAMES)) return { ok: false, error: 'Pick how you want to be paid.' };
  const a = typeof account === 'string' ? account.replace(/\s+/g, ' ').trim() : '';
  if (/[\u0000-\u001f\u007f]/.test(typeof account === 'string' ? account.replace(/[\r\n\t]/g, ' ') : '')) return { ok: false, error: 'Remove the special characters.' };
  if (a.length < 5 || a.length > 200) return { ok: false, error: 'Write the account details in 5 to 200 characters.' };
  if ((method === 'payoneer' || method === 'wise' || method === 'paypal') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a))
    return { ok: false, error: `Write the email address of your ${NAMES[method]} account.` };
  if (method === 'bank' && !/\d{4}/.test(a)) return { ok: false, error: 'Write the account number or IBAN, the bank name and the account holder.' };
  return { ok: true, method: method as PayoutMethod, account: a };
}

/* "Bank transfer, ending 3000" or "Wise, s•••@example.com": enough for the seller to recognise it, never the whole account. */
export function payoutLabel(method: string | null | undefined, account: string | null | undefined): string | null {
  if (!method || !account) return null;
  const at = account.lastIndexOf('@');
  const shown = at > 0 ? `${account[0]}•••${account.slice(at)}` : `ending ${account.replace(/\s+/g, '').slice(-4)}`;
  return `${NAMES[method] ?? method}, ${shown}`;
}
