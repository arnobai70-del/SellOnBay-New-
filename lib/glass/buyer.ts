import 'server-only';
import { betaRequests } from '../beta/service';
import { productByKey } from '../catalog';
import { ticketsOf } from '../messaging/service';
import { notificationsFor, unreadCount } from '../notify';
import type { Order } from '../orders/machine';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import { hasFiles, orderTab } from './orderStatus';
import { plainWords } from './words';

/* Everything the buyer dashboard shows, for one buyer, read from the real stores. A new account sees empty states, never made-up numbers. */
export type BuyerDomain = { name: string; status: 'active' | 'requested'; expires: string | null; orderId: string | null; site: string | null };

export async function buyerOrders(userId: string): Promise<Order[]> {
  const all = await (await orderStore()).forUser(userId);
  return all.filter((o) => o.buyerId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function buyerDomains(userId: string, orders: Order[]): Promise<BuyerDomain[]> {
  const out: BuyerDomain[] = [];
  if (supabaseConfigured) {
    const { data } = await createAdminClient().from('domains').select('name, expires_at, order_id').eq('owner_id', userId);
    for (const d of data ?? []) out.push({ name: d.name, status: 'active', expires: d.expires_at, orderId: d.order_id, site: orders.find((o) => o.id === d.order_id)?.title ?? null });
  }
  for (const o of orders)
    if (o.domain?.name && !out.some((d) => d.name === o.domain!.name))
      out.push({ name: o.domain.name, status: o.domain.ref ? 'active' : 'requested', expires: o.domain.expires ?? null, orderId: o.id, site: plainWords(o.title) });
  const reqs = (await betaRequests()).filter((r) => r.buyerId === userId && r.domain && !r.declineReason);
  for (const r of reqs)
    if (!out.some((d) => d.name === r.domain))
      out.push({ name: r.domain, status: 'requested', expires: null, orderId: r.orderId, site: plainWords(orders.find((o) => o.id === r.orderId)?.title ?? r.productKey) });
  return out;
}

export async function buyerWebsites(orders: Order[]) {
  const owned = orders.filter((o) => hasFiles(o.state) && o.kind === 'product');
  return Promise.all(
    owned.map(async (o) => {
      const p = o.productKey ? await productByKey(o.productKey) : undefined;
      return {
        order: o,
        title: plainWords(o.title),
        seller: p?.ownerType === 'platform' ? 'SellOnBay' : (p?.seller ?? 'SellOnBay'),
        stack: p?.stack ?? '',
        docsUrl: p?.docsUrl ?? null,
        slug: p?.id ?? null,
      };
    }),
  );
}

export async function buyerOverview(userId: string) {
  const orders = await buyerOrders(userId);
  const [domains, tickets, notes, unread] = await Promise.all([buyerDomains(userId, orders), ticketsOf({ id: userId, role: 'buyer' }), notificationsFor(userId, 6), unreadCount(userId)]);
  return {
    orders,
    owned: orders.filter((o) => hasFiles(o.state)).length,
    inReview: orders.filter((o) => o.state === 'delivered' || o.state === 'beta_requested').length,
    inProgress: orders.filter((o) => orderTab(o.state) === 'progress').length,
    domains,
    openTickets: tickets.filter((t) => t.status !== 'closed').length,
    notes,
    unread: unread ?? 0,
  };
}

/* The badge counts in the buyer menu. */
export async function buyerBadges(userId: string) {
  const [orders, unread] = await Promise.all([buyerOrders(userId), unreadCount(userId)]);
  return { badges: { orders: orders.filter((o) => ['awaiting_payment', 'payment_review', 'delivered'].includes(o.state)).length, notifications: unread ?? 0 }, unread: unread ?? 0 };
}
