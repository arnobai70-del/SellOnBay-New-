import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import type { Channel, SubjectType } from './rules';

/* Conversation messages and support tickets (migration 0062). Postgres when there, memory otherwise. Only lib/messaging/service.ts writes. */
export type Message = { id: string; subjectType: SubjectType; subjectId: string; channel: Channel; senderId: string | null; senderRole: 'buyer' | 'seller' | 'admin'; body: string; at: number };
export type TicketState = 'open' | 'waiting_user' | 'closed';
export type Ticket = { id: string; openedBy: string; openerRole: 'buyer' | 'seller'; orderId: string | null; subject: string; status: TicketState; createdAt: number; updatedAt: number };

type Mem = { messages: Message[]; tickets: Map<string, Ticket> };
const mem: Mem = ((globalThis as { __convMem?: Mem }).__convMem ??= { messages: [], tickets: new Map() });

async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  const { error } = await createAdminClient().from('conversation_messages').select('id').limit(1);
  return !error;
}
const uuidOrNull = (id: string | null | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

export async function insertMessage(m: Omit<Message, 'id' | 'at'>): Promise<Message> {
  const rec: Message = { ...m, id: crypto.randomUUID(), at: Date.now() };
  if (!(await pg())) {
    mem.messages.push(rec);
    return rec;
  }
  const { error } = await createAdminClient()
    .from('conversation_messages')
    .insert({
      id: rec.id,
      subject_type: m.subjectType,
      subject_id: m.subjectId,
      channel: m.channel,
      sender_id: uuidOrNull(m.senderId),
      sender_role: m.senderRole,
      body: m.body,
      created_at: new Date(rec.at).toISOString(),
    });
  if (error) throw new Error('Could not send the message.');
  return rec;
}

export async function messagesOf(subjectType: SubjectType, subjectId: string, channels: Channel[]): Promise<Message[]> {
  if (!channels.length) return [];
  if (!(await pg())) return mem.messages.filter((m) => m.subjectType === subjectType && m.subjectId === subjectId && channels.includes(m.channel));
  const { data } = await createAdminClient()
    .from('conversation_messages')
    .select('id, subject_type, subject_id, channel, sender_id, sender_role, body, created_at')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .in('channel', channels)
    .order('created_at')
    .limit(1000);
  return (data ?? []).map((r) => ({
    id: r.id,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    channel: r.channel,
    senderId: r.sender_id,
    senderRole: r.sender_role,
    body: r.body,
    at: Date.parse(r.created_at),
  }));
}

const tFrom = (r: Record<string, unknown>): Ticket => ({
  id: r.id as string,
  openedBy: r.opened_by as string,
  openerRole: r.opener_role as Ticket['openerRole'],
  orderId: (r.order_id as string) ?? null,
  subject: r.subject as string,
  status: r.status as TicketState,
  createdAt: Date.parse(r.created_at as string),
  updatedAt: Date.parse(r.updated_at as string),
});
export async function insertTicket(t: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Ticket> {
  const now = Date.now();
  const rec: Ticket = { ...t, id: crypto.randomUUID(), status: 'open', createdAt: now, updatedAt: now };
  if (!(await pg())) {
    mem.tickets.set(rec.id, rec);
    return rec;
  }
  const { data, error } = await createAdminClient()
    .from('support_tickets')
    .insert({ id: rec.id, opened_by: t.openedBy, opener_role: t.openerRole, order_id: t.orderId, subject: t.subject })
    .select('*')
    .single();
  if (error || !data) throw new Error('Could not open the ticket.');
  return tFrom(data);
}
export async function getTicket(id: string): Promise<Ticket | null> {
  if (!(await pg())) return mem.tickets.get(id) ?? null;
  const { data } = await createAdminClient().from('support_tickets').select('*').eq('id', id).maybeSingle();
  return data ? tFrom(data) : null;
}
export async function listTickets(f: { openedBy?: string; statuses?: TicketState[] } = {}): Promise<Ticket[]> {
  if (!(await pg()))
    return [...mem.tickets.values()].filter((t) => (!f.openedBy || t.openedBy === f.openedBy) && (!f.statuses || f.statuses.includes(t.status))).sort((a, b) => b.updatedAt - a.updatedAt);
  let q = createAdminClient().from('support_tickets').select('*').order('updated_at', { ascending: false }).limit(300);
  if (f.openedBy) q = q.eq('opened_by', f.openedBy);
  if (f.statuses) q = q.in('status', f.statuses);
  const { data } = await q;
  return (data ?? []).map(tFrom);
}
export async function setTicketStatus(t: Ticket, status: TicketState): Promise<Ticket> {
  const now = Date.now();
  if (!(await pg())) {
    const next = { ...t, status, updatedAt: now };
    mem.tickets.set(t.id, next);
    return next;
  }
  const { data, error } = await createAdminClient()
    .from('support_tickets')
    .update({ status, updated_at: new Date(now).toISOString() })
    .eq('id', t.id)
    .select('*');
  if (error || !data?.length) throw new Error('Could not update the ticket.');
  return tFrom(data[0]);
}
export async function touchTicket(id: string): Promise<void> {
  if (!(await pg())) {
    const t = mem.tickets.get(id);
    if (t) mem.tickets.set(id, { ...t, updatedAt: Date.now() });
    return;
  }
  await createAdminClient().from('support_tickets').update({ updated_at: new Date().toISOString() }).eq('id', id);
}
