/* Is this profile row allowed to act right now? Banned, or suspended until a time that has not come yet (see lib/strikes.ts). No imports: the proxy uses it too. */
export const cannotAct = (p: { banned?: boolean | null; suspended_until?: string | null } | null | undefined, now = Date.now()) =>
  !p || !!p.banned || (!!p.suspended_until && Date.parse(p.suspended_until) > now);

/*
 * The four roles (owner, 2026-10-20): a visitor (signed out) browses and opens demos; a buyer buys products and hires developers;
 * a seller sells; an admin runs the marketplace. Since 2026-11-07 (owner) one account may buy and sell: a seller account buys too (never from
 * itself, which the quote refuses). Admin accounts never buy.
 */
export const mayBuy = (role: string | null | undefined) => role === 'buyer' || role === 'seller';
export const BUYERS_ONLY = 'Admin accounts cannot buy, hire or ask sellers questions. Sign in with your own account, or make a free one.';
