import 'server-only';
import { BLOCKED_MESSAGE, checkMessage } from './chatFilter';
import { CONFIG, DAY_MS } from './config';
import { limit } from './rateLimit';
import { notify } from './notify';
import type { Order } from './orders/machine';
import { orderStore } from './orders/store';
import { saveBlocked } from './presale/service';
import { createAdminClient } from './supabase/server';

/*
 * Order chat. One server function sends every message: the sender must be the buyer or the seller of the order, the order must be paid and not closed
 * for long, a rate limit applies per person, and the same contact-details filter as everywhere runs on the server. A blocked message is stored with its
 * reason (for admins), counts as a strike, is never delivered, and the sender is told why in general words.
 */
export type Role = 'buyer' | 'seller';
export type ChatMessage = { id: string; orderId: string; role: Role; senderId: string | null; body: string; at: number };

const mem: Map<string, ChatMessage[]> = ((globalThis as { __chatMem?: Map<string, ChatMessage[]> }).__chatMem ??= new Map());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pg = async () => (await orderStore()).kind === 'postgres';

/* Who is this person on this order? A signed-out buyer (demo mode) is the buyer of an order that has no account on it. */
export function roleIn(o: Order, viewerId: string | null | undefined): Role | null {
  if (viewerId && o.sellerId === viewerId) return 'seller';
  if (viewerId && o.buyerId === viewerId) return 'buyer';
  if (!viewerId && o.buyerId === null) return 'buyer';
  return null;
}

/* Chat opens when the money is in escrow and stays open through the review and the bug-fix week. */
const CHAT_STATES = ['funded', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'disputed', 'fix_requested', 'overdue'];
export const chatOpen = (o: Order) => CHAT_STATES.includes(o.state);

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; status: number; error: string; blocked?: boolean };
const fail = (status: number, error: string, blocked = false): SendResult => ({ ok: false, status, error, ...(blocked ? { blocked } : {}) });

export async function sendMessage(o: Order, role: Role, viewerId: string | null, ip: string, rawBody: string, now = Date.now()): Promise<SendResult> {
  if (!chatOpen(o)) return fail(409, o.state === 'awaiting_payment' ? 'Chat opens when the payment is held in escrow.' : 'This order is closed, so the chat is closed too.');
  const body = rawBody.trim();
  if (!body) return fail(400, 'Write a message first.');
  if (body.length > CONFIG.chat.maxChars) return fail(400, `Keep a message under ${CONFIG.chat.maxChars} characters.`);
  const [count, minutes] = CONFIG.chat.perUserBurst;
  if (!(await limit(`chat:${viewerId ?? o.id}:${role}`, count, minutes * 60_000))) return fail(429, 'You are sending messages very fast. Wait a moment.');

  const usePg = await pg();
  if (usePg && (!viewerId || !UUID.test(viewerId))) return fail(401, 'Sign in to message about this order.');
  const verdict = checkMessage(body);
  if (!verdict.ok) {
    await saveBlocked({ senderId: viewerId ?? `demo:${o.id}`, sellerId: o.sellerId, productKey: o.productKey ?? '', body, reason: verdict.reason, ip, context: 'order' });
    return fail(422, BLOCKED_MESSAGE, true);
  }
  const m: ChatMessage = { id: crypto.randomUUID(), orderId: o.id, role, senderId: viewerId, body, at: now };
  if (usePg) {
    const { error } = await createAdminClient()
      .from('messages')
      .insert({ id: m.id, order_id: o.id, sender_id: viewerId, sender_role: role, body, created_at: new Date(now).toISOString() });
    if (error) return fail(500, 'Could not send the message.');
  } else mem.set(o.id, [...(mem.get(o.id) ?? []), m]);
  // The other person hears about it, at most once an hour per order, so a long chat does not flood their notifications.
  const other = role === 'buyer' ? o.sellerId : o.buyerId;
  await notify(other, 'new_message', { title: o.title, orderId: o.id }, { dedupe: `msg:${o.id}:${role}:${Math.floor(now / (DAY_MS / 24))}` });
  return { ok: true, message: m };
}

export async function listMessages(orderId: string, since = 0): Promise<ChatMessage[]> {
  if (await pg()) {
    let q = createAdminClient().from('messages').select('id, order_id, sender_id, sender_role, body, created_at').eq('order_id', orderId).order('created_at', { ascending: true }).limit(500);
    // A junk value (too big, negative) is ignored instead of throwing on toISOString.
    const after = new Date(since);
    if (since > 0 && !Number.isNaN(after.getTime())) q = q.gt('created_at', after.toISOString());
    const { data } = await q;
    return (data ?? []).map((r) => ({ id: r.id, orderId: r.order_id, role: (r.sender_role ?? 'buyer') as Role, senderId: r.sender_id, body: r.body, at: Date.parse(r.created_at) }));
  }
  return (mem.get(orderId) ?? []).filter((m) => m.at > since);
}
