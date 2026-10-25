import 'server-only';
import { isBlocked } from './chatFilter';
import type { Order } from './orders/machine';
import { getOrder } from './orders/service';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Reviews. Only the buyer of an accepted order can leave one, one per order, rating 1 to 5 and a short note (the chat filter applies).
 * Real ratings replace the made-up starter ratings as soon as a listing has one real review. Output of Product and AggregateRating
 * JSON-LD uses these numbers only (see components/JsonLd.tsx).
 */
export type Review = { orderId: string; productKey: string; buyerId: string | null; rating: number; body: string; at: number; who: string };
const mem: Review[] = ((globalThis as { __reviewMem?: Review[] }).__reviewMem ??= []);
const pg = async () => (await orderStore()).kind === 'postgres';
const ACCEPTED = ['accepted', 'payout_pending', 'paid_out'];

export type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

export const canReview = (o: Order) => ACCEPTED.includes(o.state) && !!o.productKey && o.kind === 'product';

export async function reviewOfOrder(orderId: string): Promise<Review | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('reviews').select('order_id, product_key, buyer_id, rating, body, created_at').eq('order_id', orderId).maybeSingle();
    return data
      ? { orderId: data.order_id, productKey: data.product_key ?? '', buyerId: data.buyer_id, rating: data.rating, body: data.body, at: Date.parse(data.created_at), who: 'Verified buyer' }
      : null;
  }
  return mem.find((r) => r.orderId === orderId) ?? null;
}

export async function addReview(orderId: string, buyerId: string | null, i: { rating: number; body: string }): Promise<R<Review>> {
  const o = await getOrder(orderId);
  if (!o) return fail(404, 'Order not found.');
  if (!canReview(o)) return fail(409, 'You can review a product once the order is accepted.');
  if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5) return fail(400, 'Pick 1 to 5 stars.');
  const body = i.body.trim();
  if (body.length > 1000) return fail(400, 'Keep the review under 1000 characters.');
  if (body && isBlocked(body)) return fail(400, 'Keep emails, phone numbers and links out of a review.');
  if (await reviewOfOrder(orderId)) return fail(409, 'You already reviewed this order.');
  const r: Review = { orderId, productKey: o.productKey!, buyerId: o.buyerId ?? buyerId, rating: i.rating, body, at: Date.now(), who: 'Verified buyer' };
  if (await pg()) {
    // A verified review comes from the account that paid: an order placed signed out cannot be reviewed by whoever holds its id.
    if (!o.buyerId) return fail(401, 'Only the account that bought this can review it.');
    const { error } = await createAdminClient().from('reviews').insert({ order_id: orderId, product_id: o.productId, product_key: r.productKey, buyer_id: r.buyerId, rating: r.rating, body });
    if (error) return fail(error.code === '23505' ? 409 : 500, error.code === '23505' ? 'You already reviewed this order.' : 'Could not save the review.');
  } else mem.push(r);
  return { ok: true, value: r };
}

export async function reviewsFor(productKey: string, limit = 20): Promise<Review[]> {
  if (await pg().catch(() => false)) {
    const { data } = await createAdminClient()
      .from('reviews')
      .select('order_id, product_key, buyer_id, rating, body, created_at')
      .eq('product_key', productKey)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((d) => ({ orderId: d.order_id, productKey: d.product_key, buyerId: d.buyer_id, rating: d.rating, body: d.body, at: Date.parse(d.created_at), who: 'Verified buyer' }));
  }
  return mem
    .filter((r) => r.productKey === productKey)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

/* Average to one decimal and the count. Zero reviews means there are no real ratings yet. */
export async function ratingOf(productKey: string): Promise<{ avg: number; count: number }> {
  if (await pg().catch(() => false)) {
    const { data } = await createAdminClient().from('reviews').select('rating').eq('product_key', productKey);
    const n = data?.length ?? 0;
    return { avg: n ? Math.round(((data ?? []).reduce((s, r) => s + r.rating, 0) / n) * 10) / 10 : 0, count: n };
  }
  const list = mem.filter((r) => r.productKey === productKey);
  return { avg: list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : 0, count: list.length };
}

/* What the order page needs: can a review be left now, and the one already left. */
export async function reviewSummary(o: Order) {
  const mine = await reviewOfOrder(o.id);
  return { review: mine ? { rating: mine.rating, body: mine.body } : null, canReview: canReview(o) && !mine };
}

/* Admin clean-up: remove one review (a fake one), or every review a buyer wrote. The product rating follows by itself (trigger in Postgres). Returns how many went. */
export async function deleteReview(orderId: string): Promise<number> {
  if (await pg()) return (await createAdminClient().from('reviews').delete().eq('order_id', orderId).select('order_id')).data?.length ?? 0;
  const i = mem.findIndex((r) => r.orderId === orderId);
  if (i < 0) return 0;
  mem.splice(i, 1);
  return 1;
}
export async function deleteReviewsBy(buyerId: string): Promise<number> {
  if (await pg()) return (await createAdminClient().from('reviews').delete().eq('buyer_id', buyerId).select('order_id')).data?.length ?? 0;
  const keep = mem.filter((r) => r.buyerId !== buyerId);
  const n = mem.length - keep.length;
  mem.splice(0, mem.length, ...keep);
  return n;
}
