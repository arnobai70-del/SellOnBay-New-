import 'server-only';
import { audit } from './admin/audit';
import { CONFIG, DAY_MS, HOUR_MS } from './config';
import { notify, notifyAdmins } from './notify';
import type { Order } from './orders/machine';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Repository delivery, by hand (no GitHub automation yet).
 *  - The invite: GitHub removes an unaccepted invitation after CONFIG.repo.inviteDays. We keep when it was last sent, remind the buyer a day before it
 *    runs out, tell the seller when it has, and let the seller send it again (up to CONFIG.repo.maxResends times).
 *  - The take-back: when an order is refunded or cancelled after the invite, the seller is told to remove the buyer from the repository and says when
 *    it is done; an admin then confirms. The order page shows where that stands. Every step is audited.
 */
export type RevokeState = 'pending' | 'seller_done' | 'confirmed';
export type Task = {
  orderId: string;
  inviteSentAt?: number;
  resends: number;
  revokeState?: RevokeState;
  requestedAt?: number;
  sellerDoneAt?: number;
  confirmedAt?: number;
  confirmedBy?: string | null;
  note?: string;
};
export type Result<T = true> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

const mem: Map<string, Task> = ((globalThis as { __repoMem?: Map<string, Task> }).__repoMem ??= new Map());
let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('repo_access_tasks').select('order_id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}
const ms = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : undefined);
const iso = (n?: number) => (n === undefined ? null : new Date(n).toISOString());
const fromRow = (r: Record<string, unknown>): Task => ({
  orderId: r.order_id as string,
  inviteSentAt: ms(r.invite_sent_at),
  resends: (r.resends as number) ?? 0,
  revokeState: (r.revoke_state as RevokeState) ?? undefined,
  requestedAt: ms(r.revoke_requested_at),
  sellerDoneAt: ms(r.revoke_seller_done_at),
  confirmedAt: ms(r.revoke_confirmed_at),
  confirmedBy: (r.revoke_confirmed_by as string) ?? null,
  note: (r.revoke_note as string) ?? undefined,
});

export async function taskOf(orderId: string): Promise<Task | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('repo_access_tasks').select('*').eq('order_id', orderId).maybeSingle();
    return data ? fromRow(data) : null;
  }
  return mem.get(orderId) ?? null;
}
async function save(t: Task) {
  if (await pg()) {
    await createAdminClient()
      .from('repo_access_tasks')
      .upsert({
        order_id: t.orderId,
        invite_sent_at: iso(t.inviteSentAt),
        resends: t.resends,
        revoke_state: t.revokeState ?? null,
        revoke_requested_at: iso(t.requestedAt),
        revoke_seller_done_at: iso(t.sellerDoneAt),
        revoke_confirmed_at: iso(t.confirmedAt),
        revoke_confirmed_by: t.confirmedBy ?? null,
        revoke_note: t.note ?? null,
      });
  } else mem.set(t.orderId, t);
}

/* ---------- the invite ---------- */
const invitedAtFromLog = async (orderId: string) => (await (await orderStore()).events(orderId)).filter((e) => e.event === 'repo_invited').at(-1)?.at;
export const inviteExpiry = (invitedAt: number) => invitedAt + CONFIG.repo.inviteDays * DAY_MS;

/* Written when the seller says the invite was sent. */
export async function noteInvite(orderId: string, at = Date.now()) {
  const t = (await taskOf(orderId)) ?? { orderId, resends: 0 };
  await save({ ...t, inviteSentAt: at });
}

/* When the invite was last sent and when it runs out. Null if no invite was sent. */
export async function inviteState(o: Order, now = Date.now()) {
  if (o.deliveryType !== 'repo_access') return null;
  const t = await taskOf(o.id);
  const invitedAt = t?.inviteSentAt ?? (await invitedAtFromLog(o.id));
  if (invitedAt === undefined) return null;
  const expiresAt = inviteExpiry(invitedAt);
  return { invitedAt, expiresAt, expired: o.state === 'in_delivery' && now > expiresAt, resends: t?.resends ?? 0 };
}

export async function resendInvite(orderId: string, sellerId: string, now = Date.now()): Promise<Result> {
  const o = await (await orderStore()).get(orderId);
  if (!o || o.sellerId !== sellerId) return fail(404, 'Order not found.');
  if (o.deliveryType !== 'repo_access') return fail(409, 'This order is not delivered through a repository.');
  if (o.state !== 'in_delivery')
    return fail(409, o.state === 'funded' ? 'Send the first invite with "I sent the invite".' : `The invite cannot be sent again now (the order is ${o.state.replace('_', ' ')}).`);
  const t = (await taskOf(orderId)) ?? { orderId, resends: 0 };
  if (t.resends >= CONFIG.repo.maxResends) return fail(429, 'You already sent the invite again several times. Message the buyer in the order chat.');
  await save({ ...t, inviteSentAt: now, resends: t.resends + 1 });
  await notify(o.buyerId, 'repo_invite_resent', { title: o.title, orderId, days: CONFIG.repo.inviteDays });
  await audit(sellerId, 'repo_invite_resent', 'order', orderId, { resends: t.resends + 1 });
  return { ok: true, value: true };
}

/* Called with the timed reminders: the buyer a day before the invite runs out, both sides once it has. Each goes out once per invite. */
export async function inviteReminders(o: Order, now = Date.now()) {
  if (o.deliveryType !== 'repo_access' || o.state !== 'in_delivery') return;
  const s = await inviteState(o, now);
  if (!s) return;
  const base = { title: o.title, orderId: o.id };
  if (s.expired) {
    await notify(o.sellerId, 'repo_invite_expired', base, { dedupe: `repo-expired:${o.id}:${s.invitedAt}` });
    const confirmOn = new Date(s.invitedAt + CONFIG.repo.autoConfirmDays * DAY_MS).toISOString().slice(0, 10);
    await notify(o.buyerId, 'repo_invite_lapsed', { ...base, date: confirmOn }, { dedupe: `repo-lapsed:${o.id}:${s.invitedAt}` });
  } else if (s.expiresAt - now <= CONFIG.repo.reminderHours * HOUR_MS) await notify(o.buyerId, 'repo_invite_expiring', base, { dedupe: `repo-expiring:${o.id}:${s.invitedAt}` });
}

/* ---------- taking access back ---------- */
/* Called after an order moves. A refunded or cancelled repository order whose invite went out gets a checklist; nothing happens before the invite. */
export async function requestRevocation(o: Order, now = Date.now()): Promise<boolean> {
  if (o.deliveryType !== 'repo_access' || !['refunded', 'cancelled'].includes(o.state) || !o.fundedAt) return false;
  const invited = (await inviteState(o, now)) !== null;
  if (!invited) return false;
  const t = (await taskOf(o.id)) ?? { orderId: o.id, resends: 0 };
  if (t.revokeState) return false; // already asked
  await save({ ...t, revokeState: 'pending', requestedAt: now });
  await notify(o.sellerId, 'repo_revoke_request', { title: o.title, orderId: o.id, github: o.githubUsername ?? '', outcome: o.state });
  await audit(null, 'repo_revoke_requested', 'order', o.id, { outcome: o.state });
  return true;
}

export async function sellerRemoved(orderId: string, sellerId: string, now = Date.now()): Promise<Result> {
  const o = await (await orderStore()).get(orderId);
  if (!o || o.sellerId !== sellerId) return fail(404, 'Order not found.');
  const t = await taskOf(orderId);
  if (!t?.revokeState) return fail(409, 'Nobody asked you to remove access on this order.');
  if (t.revokeState !== 'pending') return fail(409, t.revokeState === 'confirmed' ? 'This was already confirmed.' : 'You already said it was done.');
  await save({ ...t, revokeState: 'seller_done', sellerDoneAt: now });
  await notifyAdmins('repo_revoke_ready', { title: o.title, orderId }, `repo-ready:${orderId}`);
  await audit(sellerId, 'repo_revoke_seller_done', 'order', orderId, {});
  return { ok: true, value: true };
}

export async function confirmRevoked(adminId: string | null, orderId: string, note: string, now = Date.now()): Promise<Result> {
  const why = note.trim();
  if (why.length < 5) return fail(400, 'Write how you checked (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the note under 500 characters.');
  const o = await (await orderStore()).get(orderId);
  const t = await taskOf(orderId);
  if (!o || !t?.revokeState) return fail(404, 'No access removal like that.');
  if (t.revokeState === 'confirmed') return fail(409, 'This was already confirmed.');
  await save({ ...t, revokeState: 'confirmed', confirmedAt: now, confirmedBy: adminId, note: why });
  await notify(o.sellerId, 'repo_revoke_confirmed', { title: o.title, orderId });
  await notify(o.buyerId, 'repo_revoke_confirmed', { title: o.title, orderId });
  await audit(adminId, 'repo_revoke_confirmed', 'order', orderId, { note: why, sellerSaidDone: t.revokeState === 'seller_done' });
  return { ok: true, value: true };
}

/* Asks the seller again. Once a day per order at most. */
export async function remindSeller(adminId: string | null, orderId: string, now = Date.now()): Promise<Result> {
  const o = await (await orderStore()).get(orderId);
  const t = await taskOf(orderId);
  if (!o || t?.revokeState !== 'pending') return fail(409, 'There is nothing to remind the seller about.');
  await notify(
    o.sellerId,
    'repo_revoke_request',
    { title: o.title, orderId, github: o.githubUsername ?? '', outcome: o.state },
    { dedupe: `repo-remind:${orderId}:${new Date(now).toISOString().slice(0, 10)}` },
  );
  await audit(adminId, 'repo_revoke_reminded', 'order', orderId, {});
  return { ok: true, value: true };
}

export type Checklist = { orderId: string; title: string; github: string; state: RevokeState; outcome: string; requestedAt: number; sellerDoneAt?: number };
/* Open items first (the seller's "done" waiting for an admin, then still pending), oldest first. */
export async function checklist(): Promise<Checklist[]> {
  const tasks: Task[] = [];
  if (await pg()) {
    const { data } = await createAdminClient().from('repo_access_tasks').select('*').in('revoke_state', ['pending', 'seller_done']).order('revoke_requested_at').limit(200);
    tasks.push(...(data ?? []).map(fromRow));
  } else tasks.push(...[...mem.values()].filter((t) => t.revokeState === 'pending' || t.revokeState === 'seller_done'));
  const store = await orderStore();
  const out: Checklist[] = [];
  for (const t of tasks) {
    const o = await store.get(t.orderId);
    if (o) out.push({ orderId: t.orderId, title: o.title, github: o.githubUsername ?? '', state: t.revokeState!, outcome: o.state, requestedAt: t.requestedAt ?? 0, sellerDoneAt: t.sellerDoneAt });
  }
  return out.sort((a, b) => Number(b.state === 'seller_done') - Number(a.state === 'seller_done') || a.requestedAt - b.requestedAt);
}

/* What the seller still has to do: access to remove. */
export async function pendingForSeller(sellerId: string): Promise<Checklist[]> {
  const store = await orderStore();
  const out: Checklist[] = [];
  for (const c of await checklist()) if (c.state === 'pending' && (await store.get(c.orderId))?.sellerId === sellerId) out.push(c);
  return out;
}
