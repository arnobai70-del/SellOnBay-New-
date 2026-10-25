import 'server-only';
import { TEMPLATES, type NotificationKind, type Payload } from '../emails/templates';
import { emailProvider } from './providers/email';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';
import { outboxReady, queueEmail } from './emailQueue';

/*
 * One function for every notification: an in-app row for the person and, when we know their address, an email through the email provider.
 * `dedupe` makes a reminder go out once (for example "due_soon:<order id>"). Failures never break the thing that caused the notification.
 */
export type Notification = { id: string; userId: string; kind: NotificationKind; payload: Payload; read: boolean; at: number; subject: string; text: string };

const mem: Notification[] = ((globalThis as { __notifMem?: Notification[] }).__notifMem ??= []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('notifications').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

async function addressOf(userId: string): Promise<string | null> {
  if (!UUID.test(userId) || (await orderStore()).kind !== 'postgres') return null;
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

/* Returns true once the in-app notification is stored; email delivery is best-effort and reported separately. */
export async function notify(userId: string | null | undefined, kind: NotificationKind, payload: Payload = {}, opts: { dedupe?: string; email?: boolean } = {}): Promise<boolean> {
  if (!userId) return false;
  try {
    const { subject, text } = TEMPLATES[kind](payload);
    let notificationId: string;
    const stored = await pg();
    if (stored) {
      const { data, error } = await createAdminClient()
        .from('notifications')
        .insert({ user_id: userId, kind, payload, dedupe: opts.dedupe ?? null })
        .select('id')
        .single();
      if (error || !data?.id) return error?.code === '23505' ? false : (console.error('notify: could not persist notification'), false);
      notificationId = data.id;
    } else {
      if (opts.dedupe && mem.some((n) => n.userId === userId && n.kind === kind && n.payload.__dedupe === opts.dedupe)) return false;
      notificationId = crypto.randomUUID();
      mem.push({ id: notificationId, userId, kind, payload: { ...payload, __dedupe: opts.dedupe }, read: false, at: Date.now(), subject, text });
    }
    // The in-app notification is persisted independently. Email API failure
    // must not turn a successfully committed notification into a failed action.
    if (opts.email !== false) {
      try {
        // With the queue (migration 0051) the email goes out after the response and is retried; without it, at once as before.
        if (stored && UUID.test(userId) && emailProvider().name !== 'unconfigured' && (await outboxReady()) && (await queueEmail(notificationId))) return true;
        const to = await addressOf(userId);
        if (to) await emailProvider().send({ to, subject, text, idempotencyKey: `notification/${notificationId}` });
      } catch {
        // Never log recipient details, provider response bodies or credentials.
        console.error('Notification email delivery failed:', kind);
      }
    }
    return true;
  } catch (e) {
    console.error('notify failed', kind, e);
    return false;
  }
}

export async function notificationsFor(userId: string, limit = 50): Promise<Notification[]> {
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('notifications')
      .select('id, user_id, kind, payload, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((r) => {
      const k = r.kind as NotificationKind;
      const tpl = TEMPLATES[k]?.(r.payload ?? {}) ?? { subject: r.kind, text: '' };
      return { id: r.id, userId: r.user_id, kind: k, payload: r.payload ?? {}, read: !!r.read_at, at: Date.parse(r.created_at), ...tpl };
    });
  }
  return mem
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}
export const unreadCount = async (userId: string) => (await notificationsFor(userId, 200)).filter((n) => !n.read).length;

export async function markRead(userId: string, id: string | 'all'): Promise<void> {
  if (await pg()) {
    let q = createAdminClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
    if (id !== 'all') q = q.eq('id', id);
    await q;
    return;
  }
  for (const n of mem) if (n.userId === userId && (id === 'all' || n.id === id)) n.read = true;
}

/* Everybody with the admin role. Memory mode has no accounts, so nobody. */
export async function adminIds(): Promise<string[]> {
  if ((await orderStore()).kind !== 'postgres') return [];
  const { data } = await createAdminClient().from('profiles').select('id').eq('role', 'admin');
  return (data ?? []).map((r) => r.id);
}
/* The address that gets every admin alert as an email too (owner, 2026-10-23), whoever the admin accounts are. ADMIN_ALERT_EMAIL replaces it. */
export const ADMIN_ALERT_EMAIL = (process.env.ADMIN_ALERT_EMAIL ?? 'sellonbayus@gmail.com').trim();

/* One email to the owner's address. Best effort: a mail problem never stops the thing that caused the alert. */
async function mailOwner(kind: NotificationKind, payload: Payload, dedupe?: string) {
  if (!ADMIN_ALERT_EMAIL) return;
  try {
    const { subject, text } = TEMPLATES[kind](payload);
    await emailProvider().send({ to: ADMIN_ALERT_EMAIL, subject, text, idempotencyKey: dedupe ? `owner/${kind}/${dedupe}` : undefined });
  } catch {
    console.error('Owner alert email failed:', kind);
  }
}

export async function notifyAdmins(kind: NotificationKind, payload: Payload, dedupe?: string) {
  let ownerIsAdmin = false;
  for (const id of await adminIds()) {
    await notify(id, kind, payload, { dedupe });
    // An admin who already has this address gets the email through their own notification: do not send it twice.
    if ((await addressOf(id).catch(() => null))?.toLowerCase() === ADMIN_ALERT_EMAIL.toLowerCase()) ownerIsAdmin = true;
  }
  if (!ownerIsAdmin) await mailOwner(kind, payload, dedupe);
}
