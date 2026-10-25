/* When the seller's real files may be released. Pure, so it can be tested. */

/* Funded means the buyer's money is in escrow. Before that, and after a cancel or refund, nothing is released. */
import { FUNDED_STATES } from '../orders/machine';
export const isFunded = (status: string) => (FUNDED_STATES as readonly string[]).includes(status);

/* Optional short delay for new or high-risk buyers. Every switch is off (0) by default. */
export type ReleaseConfig = { delayMinutes: number; newBuyerDays: number; highPriceCents: number };
export const releaseConfigFromEnv = (env: Record<string, string | undefined> = process.env): ReleaseConfig => ({
  delayMinutes: Math.max(0, Number(env.RELEASE_DELAY_MINUTES) || 0),
  newBuyerDays: Math.max(0, Number(env.RELEASE_DELAY_NEW_BUYER_DAYS) || 0),
  highPriceCents: Math.max(0, Number(env.RELEASE_DELAY_HIGH_PRICE_CENTS) || 0),
});

export type ReleaseInput = { status: string; fundedAtMs: number; nowMs: number; buyerCreatedAtMs?: number; buyerFlagged?: boolean; priceCents: number };
export type ReleaseDecision = { allowed: true } | { allowed: false; reason: 'not_funded' } | { allowed: false; reason: 'delay'; availableAtMs: number };

export function decideRelease(i: ReleaseInput, cfg: ReleaseConfig): ReleaseDecision {
  if (!isFunded(i.status)) return { allowed: false, reason: 'not_funded' };
  if (cfg.delayMinutes <= 0) return { allowed: true };
  const newBuyer = cfg.newBuyerDays > 0 && i.buyerCreatedAtMs !== undefined && i.nowMs - i.buyerCreatedAtMs < cfg.newBuyerDays * 86_400_000;
  const highPrice = cfg.highPriceCents > 0 && i.priceCents >= cfg.highPriceCents;
  // With no risk rule switched on, a delay set on its own applies to everyone.
  const anyRule = cfg.newBuyerDays > 0 || cfg.highPriceCents > 0;
  const risky = !!i.buyerFlagged || (anyRule ? newBuyer || highPrice : true);
  if (!risky) return { allowed: true };
  const availableAtMs = i.fundedAtMs + cfg.delayMinutes * 60_000;
  return i.nowMs >= availableAtMs ? { allowed: true } : { allowed: false, reason: 'delay', availableAtMs };
}
