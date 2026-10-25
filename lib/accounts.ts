/* Is this profile row allowed to act right now? Banned, or suspended until a time that has not come yet (see lib/strikes.ts). No imports: the proxy uses it too. */
export const cannotAct = (p: { banned?: boolean | null; suspended_until?: string | null } | null | undefined, now = Date.now()) =>
  !p || !!p.banned || (!!p.suspended_until && Date.parse(p.suspended_until) > now);

/*
 * The four roles (owner, 2026-10-20): a visitor (signed out) browses and opens demos; a buyer buys products and hires developers;
 * a seller sells; an admin runs the marketplace. Only a buyer account buys, asks sellers questions before buying, or hires.
 */
export const mayBuy = (role: string | null | undefined) => role === 'buyer';
export const BUYERS_ONLY = 'Only buyer accounts can buy, hire or ask sellers questions. Sign in with a buyer account, or make a free one.';
