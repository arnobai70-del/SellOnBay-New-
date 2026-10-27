import 'server-only';
import { limit } from '../rateLimit';
import { notify, notifyAdmins } from '../notify';
import { getOrder } from '../orders/service';
import { requestableProduct } from '../requests/products';
import { getRequest } from '../requests/store';
import { adminMayMessage, channelsFor, checkBody, checkSubject, mayUse, recipients, type Channel, type SubjectFacts, type SubjectType, type Viewer } from './rules';
import { getTicket, insertMessage, insertTicket, listTickets, messagesOf, setTicketStatus, touchTicket, type Message, type Ticket, type TicketState } from './store';

/* Admin-mediated messages and support tickets (owner decision D-B). Every rule is in lib/messaging/rules.ts; this file looks up the facts. */
export type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; status: number; error: string; blocked?: boolean };
const fail = (status: number, error: string, blocked?: boolean) => ({ ok: false as const, status, error, ...(blocked ? { blocked } : {}) });

/* The buyer and seller of a subject, and a title for notifications. */
export async function subjectFacts(type: SubjectType, id: string): Promise<(SubjectFacts & { title: string }) | null> {
  if (type === 'order') {
    const o = await getOrder(id);
    return o ? { buyerId: o.buyerId, sellerId: o.sellerId, title: o.title } : null;
  }
  if (type === 'request') {
    const r = await getRequest(id);
    if (!r) return null;
    const p = r.productId ? await requestableProduct(r.productId) : null;
    return { buyerId: r.buyerId, sellerId: p?.sellerId ?? null, title: p?.name ?? 'Custom development request' };
  }
  const t = await getTicket(id);
  if (!t) return null;
  return { buyerId: t.openerRole === 'buyer' ? t.openedBy : null, sellerId: t.openerRole === 'seller' ? t.openedBy : null, title: t.subject };
}

/* The messages the viewer may read, grouped by channel. Someone with no channel on the subject gets nothing (and a 404 from the route). */
export async function readConversation(v: Viewer, type: SubjectType, id: string): Promise<Result<{ channels: Channel[]; messages: Message[] }>> {
  const s = await subjectFacts(type, id);
  if (!s) return fail(404, 'Not found.');
  const channels = channelsFor(v, s);
  if (!channels.length) return fail(404, 'Not found.');
  return { ok: true, value: { channels, messages: await messagesOf(type, id, channels) } };
}

export async function postMessage(v: Viewer, type: SubjectType, id: string, channel: Channel, raw: string): Promise<Result<Message>> {
  const s = await subjectFacts(type, id);
  if (!s || !mayUse(v, s, channel)) return fail(404, 'Not found.');
  const c = checkBody(v.role, raw);
  if (!c.ok) return fail(c.blocked ? 422 : 400, c.error, c.blocked);
  if (type === 'ticket' && v.role !== 'admin' && (await getTicket(id))?.status === 'closed') return fail(409, 'This ticket is closed. Open a new one if you still need help.');
  if (v.role !== 'admin' && !(await limit(`conv:${v.id}`, 30, 10 * 60_000))) return fail(429, 'You are sending messages very fast. Wait a moment.');
  const m = await insertMessage({ subjectType: type, subjectId: id, channel, senderId: v.id, senderRole: v.role, body: c.body });
  if (type === 'ticket') {
    await touchTicket(id);
    const t = await getTicket(id);
    if (t && v.role === 'admin' && t.status === 'open') await setTicketStatus(t, 'waiting_user');
    if (t && v.role !== 'admin' && t.status === 'waiting_user') await setTicketStatus(t, 'open');
  }
  const to = recipients(v, s, channel);
  const hour = Math.floor(Date.now() / 3_600_000);
  if (to.user) await notify(to.user, 'message_new', { title: s.title }, { dedupe: `conv:${type}:${id}:${channel}:${hour}` });
  if (to.admins) await notifyAdmins('message_new', { title: s.title }, `conv:${type}:${id}:${channel}:${hour}`);
  return { ok: true, value: m };
}

/* A buyer or seller opens a support ticket (optionally about one of their orders). The first message goes into their channel with SellOnBay. */
export async function openTicket(v: Viewer, input: { subject: string; body: string; orderId?: string }): Promise<Result<Ticket>> {
  if (v.role === 'admin') return fail(400, 'Admins answer tickets; they do not open them.');
  const sj = checkSubject(input.subject);
  if (!sj.ok) return fail(sj.blocked ? 422 : 400, sj.error, sj.blocked);
  const subject = sj.subject;
  const c = checkBody(v.role, input.body);
  if (!c.ok) return fail(c.blocked ? 422 : 400, c.error, c.blocked);
  if (input.orderId) {
    const o = await getOrder(input.orderId);
    if (!o || (v.role === 'buyer' ? o.buyerId : o.sellerId) !== v.id) return fail(404, 'Order not found.');
  }
  if (!(await limit(`ticket:${v.id}`, 10, 24 * 3_600_000))) return fail(429, 'You opened many tickets today. Add to an open one instead.');
  const t = await insertTicket({ openedBy: v.id, openerRole: v.role, orderId: input.orderId ?? null, subject });
  await insertMessage({ subjectType: 'ticket', subjectId: t.id, channel: v.role === 'buyer' ? 'buyer_admin' : 'admin_seller', senderId: v.id, senderRole: v.role, body: c.body });
  await notifyAdmins('message_new', { title: `Support: ${subject}` }, `ticket:${t.id}`);
  return { ok: true, value: t };
}

export async function ticketsOf(v: Viewer): Promise<Ticket[]> {
  if (v.role === 'admin') return adminMayMessage(v) ? listTickets() : [];
  return listTickets({ openedBy: v.id });
}

export async function closeTicket(v: Viewer, id: string, status: TicketState): Promise<Result<Ticket>> {
  const t = await getTicket(id);
  if (!t) return fail(404, 'Ticket not found.');
  if (v.role === 'admin' && !adminMayMessage(v)) return fail(404, 'Ticket not found.');
  if (v.role !== 'admin' && (t.openedBy !== v.id || status !== 'closed')) return fail(404, 'Ticket not found.');
  return { ok: true, value: await setTicketStatus(t, status) };
}
