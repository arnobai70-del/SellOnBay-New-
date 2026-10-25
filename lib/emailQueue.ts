import 'server-only';
import { after } from 'next/server';
import { TEMPLATES, type NotificationKind } from '../emails/templates';
import { CONFIG } from './config';
import { emailProvider } from './providers/email';
import { createAdminClient } from './supabase/server';

/*
 * The email of a notification goes through email_outbox (migration 0051): written with the notification, sent right after the response,
 * and tried again by the scheduled job (POST /api/cron/orders) when the provider fails. Until 0051 is applied, notify() sends at once as before.
 * The idempotency key is the notification id, so a retry of an email the provider already took is not sent twice.
 */
const { maxAttempts, retryMinutes, batch } = CONFIG.emailQueue;
type Claimed = { id: number; notification_id: string; attempts: number };

let ready: { ok: boolean; at: number } | undefined;
export async function outboxReady(): Promise<boolean> {
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('email_outbox').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}
export const forgetOutboxProbe = () => {
  ready = undefined;
};

/* The wait before the next try, after this many tries. */
export const retryDelayMs = (attempts: number) => (retryMinutes[Math.min(Math.max(attempts, 1), retryMinutes.length) - 1] ?? 1) * 60_000;

/* Writes the email for a stored notification and schedules it right after the response. Returns false if it could not be queued. */
export async function queueEmail(notificationId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('email_outbox').insert({ notification_id: notificationId }).select('id').single();
  if (error || !data) return false;
  const id = Number(data.id);
  try {
    after(() => sendQueued(1, id).then(() => undefined));
  } catch {
    // Outside a request (a scheduled job, a test) there is no "after": the scheduled job sends it.
  }
  return true;
}

async function addressOf(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function sendOne(row: Claimed): Promise<'sent' | 'retry' | 'failed'> {
  const db = createAdminClient();
  const finish = async (status: 'sent' | 'failed' | 'pending') => {
    const at = new Date();
    const patch = status === 'sent' ? { status, sent_at: at.toISOString() } : status === 'failed' ? { status } : { status, next_at: new Date(at.getTime() + retryDelayMs(row.attempts)).toISOString() };
    await db.from('email_outbox').update(patch).eq('id', row.id).eq('status', 'sending');
  };
  try {
    const { data: n } = await db.from('notifications').select('id, user_id, kind, payload').eq('id', row.notification_id).maybeSingle();
    const tpl = n && TEMPLATES[n.kind as NotificationKind];
    const to = n && tpl ? await addressOf(n.user_id) : null;
    // No notification, no template or no address: nothing to send, and trying again will not change that.
    if (!n || !tpl || !to) {
      await finish('failed');
      return 'failed';
    }
    const { subject, text } = tpl(n.payload ?? {});
    await emailProvider().send({ to, subject, text, idempotencyKey: `notification/${n.id}` });
    await finish('sent');
    return 'sent';
  } catch {
    // Never log recipient details, provider response bodies or credentials.
    const last = row.attempts >= maxAttempts;
    await finish(last ? 'failed' : 'pending').catch(() => undefined);
    if (last) console.error('Notification email gave up after retries:', row.notification_id);
    return last ? 'failed' : 'retry';
  }
}

/* Sends due emails: up to `max`, or just the one with this outbox id. Safe to run on several copies at once. */
export async function sendQueued(max: number = batch, onlyId?: number): Promise<{ sent: number; retry: number; failed: number }> {
  const done = { sent: 0, retry: 0, failed: 0 };
  if (!(await outboxReady())) return done;
  const { data, error } = await createAdminClient().rpc('claim_email_outbox', { max_rows: max, only_id: onlyId ?? null });
  if (error) return done;
  for (const row of (data ?? []) as Claimed[]) done[await sendOne(row)]++;
  return done;
}
