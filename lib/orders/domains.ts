import 'server-only';
import { CONFIG, DAY_MS } from '../config';
import { notify } from '../notify';
import { orderStore } from './store';

/*
 * Domain renewal reminders (spec 8.7 "domain expiring"). A domain bought through us is registered in the buyer's name for a year. The buyer is told
 * 30, 7 and 1 days before it expires (CONFIG.domain.reminderDays), once each, so the site does not go dark by surprise. Runs from the scheduled job.
 */
const LIVE = ['funded', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out', 'disputed', 'fix_requested', 'overdue'];

/* Calendar days from today (UTC) to the expiry date: 1 means it expires tomorrow, 0 means today, negative means it already did. */
export const daysUntil = (expires: string, now: number) => Math.round((Date.parse(expires + 'T00:00:00Z') - Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z')) / DAY_MS);

/* The smallest reminder step that already applies: 5 days left with steps 30, 7, 1 means "7". Null if no step applies yet or it already expired. */
export function reminderStep(daysLeft: number, steps: readonly number[] = CONFIG.domain.reminderDays): number | null {
  if (daysLeft < 0) return null;
  const hit = [...steps].sort((a, b) => a - b).find((s) => daysLeft <= s);
  return hit ?? null;
}

export async function domainReminders(now = Date.now()): Promise<number> {
  const store = await orderStore();
  let sent = 0;
  for (const o of await store.byState(LIVE)) {
    const d = o.domain;
    if (!d || d.source !== 'new' || !d.expires) continue;
    const left = daysUntil(d.expires, now);
    const step = reminderStep(left);
    if (step === null) continue;
    if (await notify(o.buyerId, 'domain_expiring', { domain: d.name, date: d.expires, orderId: o.id }, { dedupe: `domain:${o.id}:${step}` })) sent++;
  }
  return sent;
}
