import 'server-only';
import { CONFIG, DAY_MS } from '../config';
import { orderStore } from './store';

/*
 * Starter trial credit. A buyer who finished a paid trial with a developer (accepted) can start a full custom job with the same developer
 * within the credit window, and the trial price comes off the new price, if that developer switched "credit the trial fee" on.
 * Each trial can be credited once. The credit never takes the new price below the smallest order, and it comes off the seller's side.
 */
export type TrialCredit = { trialId: string; creditCents: number };

export async function findTrialCredit(buyerId: string | null, devKey: string, packPriceCents: number, now = Date.now()): Promise<TrialCredit | null> {
  if (!buyerId) return null;
  const store = await orderStore();
  const window = CONFIG.trial.creditWindowDays * DAY_MS;
  const accepted = (await store.trials(buyerId, devKey))
    .filter((t) => t.acceptedAt !== undefined && now - t.acceptedAt <= window && ['accepted', 'payout_pending', 'paid_out'].includes(t.state))
    .sort((a, b) => a.acceptedAt! - b.acceptedAt!);
  for (const t of accepted) {
    if (await store.creditClaimed(t.id)) continue;
    const credit = Math.min(t.lines[0]?.[1] ?? 0, packPriceCents - CONFIG.extraWork.minCents);
    if (credit > 0) return { trialId: t.id, creditCents: credit };
  }
  return null;
}
