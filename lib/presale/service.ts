import 'server-only';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import { limit } from '../rateLimit';
import { CONFIG } from '../config';
import { applyStrikes, strikesSince } from '../strikes';

/* Pre-sale questions. Stored in presale_messages (or in memory when Supabase is off). Blocked attempts are kept in blocked_messages with a reason. */
const { presale } = CONFIG;
export const LIMITS = {
  perPairPerDay: presale.perPairPerDay,
  perBuyerPerDay: presale.perBuyerPerDay,
  perUserBurst: [presale.userBurst[0], presale.userBurst[1] * 60_000] as const,
  perIpBurst: [presale.ipBurst[0], presale.ipBurst[1] * 60_000] as const,
};

export type Question = { id: string; buyer_id: string; seller_id: string | null; product_key: string; body: string; reply: string | null; replied_at: string | null; created_at: string };
export type Blocked = {
  sender_name?: string;
  id: number | string;
  sender_id: string;
  seller_id: string | null;
  product_key: string | null;
  body: string | null;
  reason: string;
  context: string;
  ip: string | null;
  created_at: string;
};

const g = globalThis as { __presale?: Question[]; __presaleBlocked?: Blocked[] };
const mem = () => (g.__presale ??= []);
const memBlocked = () => (g.__presaleBlocked ??= []);
const dayAgo = () => new Date(Date.now() - 86_400_000).toISOString();

export type AskResult = { ok: true; id: string } | { ok: false; status: number; error: string };

/* The cheap checks that need no database: rate limits per person and per address. */
export async function burstLimit(userId: string, ip: string): Promise<AskResult | null> {
  if (!(await limit(`ask-user:${userId}`, ...LIMITS.perUserBurst))) return { ok: false, status: 429, error: 'You are asking too fast. Wait a few minutes and try again.' };
  if (!(await limit(`ask-ip:${ip}`, ...LIMITS.perIpBurst))) return { ok: false, status: 429, error: 'Too many questions from this connection. Try again later.' };
  return null;
}

/* How many attempts (sent or blocked) this buyer made in the last 24 hours, in total and to this seller. */
export async function dailyCounts(buyerId: string, sellerKey: string | null): Promise<{ total: number; pair: number }> {
  const pairOf = (s: string | null, k: string) => s ?? k;
  if (!supabaseConfigured) {
    const since = Date.parse(dayAgo());
    const sent = mem().filter((m) => m.buyer_id === buyerId && Date.parse(m.created_at) > since);
    const blk = memBlocked().filter((m) => m.sender_id === buyerId && m.context === 'presale' && Date.parse(m.created_at) > since);
    const all = [...sent.map((m) => pairOf(m.seller_id, m.product_key)), ...blk.map((m) => pairOf(m.seller_id, m.product_key ?? ''))];
    return { total: all.length, pair: all.filter((x) => x === sellerKey).length };
  }
  const db = createAdminClient();
  const [a, b] = await Promise.all([
    db.from('presale_messages').select('seller_id, product_key').eq('buyer_id', buyerId).gte('created_at', dayAgo()),
    db.from('blocked_messages').select('seller_id, product_key').eq('sender_id', buyerId).eq('context', 'presale').gte('created_at', dayAgo()),
  ]);
  const all = [...(a.data ?? []), ...(b.data ?? [])].map((m) => pairOf(m.seller_id, m.product_key ?? ''));
  return { total: all.length, pair: all.filter((x) => x === sellerKey).length };
}

export async function saveQuestion(q: { buyerId: string; sellerId: string | null; productKey: string; body: string; ip: string }): Promise<string> {
  if (!supabaseConfigured) {
    const row: Question = {
      id: crypto.randomUUID(),
      buyer_id: q.buyerId,
      seller_id: q.sellerId,
      product_key: q.productKey,
      body: q.body,
      reply: null,
      replied_at: null,
      created_at: new Date().toISOString(),
    };
    mem().push(row);
    return row.id;
  }
  const { data, error } = await createAdminClient()
    .from('presale_messages')
    .insert({ buyer_id: q.buyerId, seller_id: q.sellerId, product_key: q.productKey, body: q.body, ip: q.ip })
    .select('id')
    .single();
  if (error) throw new Error('Could not save the question.');
  return data.id as string;
}

export async function saveBlocked(b: { senderId: string; sellerId: string | null; productKey: string; body: string; reason: string; ip: string; context?: string }): Promise<void> {
  const context = b.context ?? 'presale';
  // The table needs a real account as the sender, so a signed-out demo sender ("demo:<order>") is kept on this server instead.
  const account = /^[0-9a-f-]{36}$/i.test(b.senderId);
  if (!supabaseConfigured || !account) {
    memBlocked().push({
      id: memBlocked().length + 1,
      sender_id: b.senderId,
      seller_id: b.sellerId,
      product_key: b.productKey,
      body: b.body,
      reason: b.reason,
      context,
      ip: b.ip,
      created_at: new Date().toISOString(),
    });
    if (supabaseConfigured) return;
    const since = await strikesSince(b.senderId);
    await applyStrikes(b.senderId, memBlocked().filter((m) => m.sender_id === b.senderId && Date.parse(m.created_at) > since).length);
    return;
  }
  const db = createAdminClient();
  await db.from('blocked_messages').insert({ sender_id: b.senderId, seller_id: b.sellerId, product_key: b.productKey, body: b.body, reason: b.reason, context, ip: b.ip });
  const since = new Date(await strikesSince(b.senderId)).toISOString();
  const { count } = await db.from('blocked_messages').select('id', { count: 'exact', head: true }).eq('sender_id', b.senderId).gte('created_at', since);
  await applyStrikes(b.senderId, count ?? 0);
}

export async function blockedList(limit = 30): Promise<Blocked[]> {
  if (!supabaseConfigured) return [...memBlocked()].reverse().slice(0, limit);
  const db = createAdminClient();
  const { data } = await db.from('blocked_messages').select('id, sender_id, seller_id, product_key, body, reason, context, ip, created_at').order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []) as Blocked[];
  const ids = [...new Set(rows.map((r) => r.sender_id))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const { data: names } = ids.length ? await db.from('profiles').select('id, full_name').in('id', ids) : { data: [] as { id: string; full_name: string }[] };
  const by = new Map((names ?? []).map((n) => [n.id, n.full_name]));
  return rows.map((r) => ({ ...r, sender_name: by.get(r.sender_id) || undefined }));
}

export async function questionsForBuyer(buyerId: string, productKey: string): Promise<Question[]> {
  if (!supabaseConfigured)
    return mem()
      .filter((m) => m.buyer_id === buyerId && m.product_key === productKey)
      .reverse();
  const { data } = await createAdminClient()
    .from('presale_messages')
    .select('id, buyer_id, seller_id, product_key, body, reply, replied_at, created_at')
    .eq('buyer_id', buyerId)
    .eq('product_key', productKey)
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? []) as Question[];
}

export async function questionsForSeller(sellerId: string): Promise<Question[]> {
  if (!supabaseConfigured)
    return mem()
      .filter((m) => m.seller_id === sellerId)
      .reverse();
  const { data } = await createAdminClient()
    .from('presale_messages')
    .select('id, buyer_id, seller_id, product_key, body, reply, replied_at, created_at')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(30);
  return (data ?? []) as Question[];
}

export async function saveReply(sellerId: string, id: string, reply: string, isAdmin: boolean): Promise<boolean> {
  if (!supabaseConfigured) {
    const m = mem().find((x) => x.id === id && (isAdmin || x.seller_id === sellerId));
    if (!m) return false;
    m.reply = reply;
    m.replied_at = new Date().toISOString();
    return true;
  }
  const db = createAdminClient();
  const { data } = await db.from('presale_messages').select('seller_id').eq('id', id).maybeSingle();
  if (!data || (!isAdmin && data.seller_id !== sellerId)) return false;
  const { error } = await db.from('presale_messages').update({ reply, replied_at: new Date().toISOString() }).eq('id', id);
  return !error;
}
