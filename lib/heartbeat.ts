import 'server-only';
import { CONFIG, DAY_MS } from './config';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * When each scheduled job last finished, so the launch check can say that the scheduler stopped calling us. Kept as rows in `app_settings`
 * (key `heartbeat:<job>`, value = time in ms; settings ignore keys they do not know), or in memory without the database. A failed write never
 * fails the job itself: the heartbeat is only a warning light.
 */
export type Job = 'orders' | 'payouts';
const key = (job: Job) => `heartbeat:${job}`;
const mem: Partial<Record<Job, number>> = ((globalThis as { __beats?: Partial<Record<Job, number>> }).__beats ??= {});
const db = async () => (await orderStore()).kind === 'postgres';

export async function beat(job: Job, at = Date.now()): Promise<void> {
  mem[job] = at;
  try {
    if (await db())
      await createAdminClient()
        .from('app_settings')
        .upsert({ key: key(job), value: at, changed_by: null, changed_at: new Date(at).toISOString() });
  } catch {
    /* the job already did its work; a missing heartbeat shows up as a warning on the launch page */
  }
}

export async function lastBeat(job: Job): Promise<number | null> {
  if (await db()) {
    const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', key(job)).maybeSingle();
    if (!error) return typeof data?.value === 'number' ? data.value : null;
  }
  return mem[job] ?? null;
}

/* How late a job may be before the launch check calls it stopped: the orders job runs every 5 to 10 minutes, the payout job once a week. */
export const staleAfterMs = (job: Job) => (job === 'orders' ? CONFIG.cron.ordersStaleMinutes * 60_000 : CONFIG.cron.payoutsStaleDays * DAY_MS);
export const isStale = (job: Job, last: number | null, now = Date.now()) => last !== null && now - last > staleAfterMs(job);
