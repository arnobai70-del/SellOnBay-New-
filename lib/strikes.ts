import 'server-only';
import { CONFIG, DAY_MS } from './config';
import { notify, notifyAdmins } from './notify';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Strikes for blocked messages. Three blocked messages in 30 days: a warning (notification and email). Five: the account is suspended for
 * a while and the admins are alerted. Every action is written down (account_actions). A suspended account cannot act (see cannotAct).
 */
export type AccountAction = { userId: string; action: 'warning' | 'suspended' | 'unsuspended'; reason: string; until?: number; at: number };
type Mem = { suspended: Map<string, number>; actions: AccountAction[] };
const mem: Mem = ((globalThis as { __strikeMem?: Mem }).__strikeMem ??= { suspended: new Map(), actions: [] });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { cannotAct } from './accounts';

export const isSuspended = (userId: string, now = Date.now()) => (mem.suspended.get(userId) ?? 0) > now;
export const actionsFor = (userId: string) => mem.actions.filter((a) => a.userId === userId);

async function pg() {
  return (await orderStore()).kind === 'postgres';
}

async function log(a: AccountAction) {
  if ((await pg()) && UUID.test(a.userId)) {
    await createAdminClient()
      .from('account_actions')
      .insert({ user_id: a.userId, action: a.action, reason: a.reason, until: a.until ? new Date(a.until).toISOString() : null });
  } else mem.actions.push(a);
}

/*
 * Blocked messages are counted from this time on: the start of the window, or the last suspension or lift if that is later.
 * Without this, the old blocks would still be in the window after a suspension ends and the next block would suspend again at once.
 */
export async function strikesSince(userId: string, now = Date.now()): Promise<number> {
  const windowStart = now - CONFIG.chat.windowDays * DAY_MS;
  let last = 0;
  if ((await pg()) && UUID.test(userId)) {
    const { data } = await createAdminClient()
      .from('account_actions')
      .select('created_at')
      .eq('user_id', userId)
      .in('action', ['suspended', 'unsuspended'])
      .order('created_at', { ascending: false })
      .limit(1);
    last = data?.[0] ? Date.parse(data[0].created_at) : 0;
  } else {
    for (const a of mem.actions) if (a.userId === userId && a.action !== 'warning') last = Math.max(last, a.at);
  }
  return Math.max(windowStart, last);
}

/*
 * Called right after a blocked message was stored. `blocksInWindow` includes the one just stored.
 * Returns what happened, so callers and tests can see it.
 */
export async function applyStrikes(userId: string, blocksInWindow: number, now = Date.now()): Promise<'none' | 'warned' | 'suspended'> {
  const { warnAtBlocks, suspendAtBlocks, suspendDays, windowDays } = CONFIG.chat;
  if (blocksInWindow >= suspendAtBlocks) {
    if (isSuspended(userId, now)) return 'none';
    const until = now + suspendDays * DAY_MS;
    if ((await pg()) && UUID.test(userId)) {
      const { data } = await createAdminClient().from('profiles').select('suspended_until').eq('id', userId).single();
      if (data?.suspended_until && Date.parse(data.suspended_until) > now) return 'none';
      await createAdminClient()
        .from('profiles')
        .update({ suspended_until: new Date(until).toISOString() })
        .eq('id', userId);
    }
    mem.suspended.set(userId, until);
    await log({ userId, action: 'suspended', reason: `${blocksInWindow} blocked messages in ${windowDays} days`, until, at: now });
    await notify(userId, 'account_suspended', { until: new Date(until).toISOString().slice(0, 10) });
    await notifyAdmins(
      'abuse_alert',
      {
        what: 'account suspended for blocked messages',
        detail: `User ${userId} had ${blocksInWindow} blocked messages in ${windowDays} days and was suspended until ${new Date(until).toISOString().slice(0, 10)}.`,
      },
      `suspend:${userId}:${new Date(now).toISOString().slice(0, 10)}`,
    );
    return 'suspended';
  }
  if (blocksInWindow === warnAtBlocks) {
    await log({ userId, action: 'warning', reason: `${blocksInWindow} blocked messages in ${windowDays} days`, at: now });
    await notify(userId, 'chat_warning', {}, { dedupe: `warn:${Math.floor(now / (windowDays * DAY_MS))}` });
    return 'warned';
  }
  return 'none';
}

/* Lets an admin lift a suspension early. */
export async function unsuspend(userId: string, adminId: string | null) {
  if ((await pg()) && UUID.test(userId)) await createAdminClient().from('profiles').update({ suspended_until: null }).eq('id', userId);
  mem.suspended.delete(userId);
  await log({ userId, action: 'unsuspended', reason: `lifted by ${adminId ?? 'an admin'}`, at: Date.now() });
}
