import 'server-only';
import { draftsFor } from '../drafts';
import { sellerDashboard } from '../dashboard';
import { questionsForSeller } from '../presale/service';
import { notificationsFor, unreadCount } from '../notify';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import { sellerHandle } from './catalog';

/* What the seller pages read, from the real stores. Verification documents are never sent to a page: only their status. */
export type StoreProfile = {
  username: string;
  handle: string;
  headline: string;
  bio: string;
  skills: string[];
  customAvailable: boolean;
  replyTime: string;
  storePaused: boolean;
  country: string;
  payoutLabel: string | null;
};
export type Verification = { status: 'none' | 'pending' | 'approved' | 'rejected'; docType?: string; note?: string | null };

export async function storeProfile(userId: string, name: string): Promise<StoreProfile> {
  const empty: StoreProfile = {
    username: '',
    handle: sellerHandle(null, name, userId),
    headline: '',
    bio: '',
    skills: [],
    customAvailable: false,
    replyTime: '',
    storePaused: false,
    country: '',
    payoutLabel: null,
  };
  if (!supabaseConfigured) return empty;
  const admin = createAdminClient();
  const [{ data: s }, { data: p }] = await Promise.all([admin.from('seller_profiles').select('*').eq('user_id', userId).maybeSingle(), admin.from('profiles').select('*').eq('id', userId).single()]);
  const { payoutLabel } = await import('../payoutDetails');
  return {
    username: s?.username ?? '',
    handle: sellerHandle(s?.username, s?.display_name || name, userId),
    headline: s?.headline ?? '',
    bio: s?.bio ?? '',
    skills: s?.skills ?? [],
    customAvailable: !!s?.custom_available,
    replyTime: s?.reply_time ?? '',
    storePaused: !!s?.store_paused,
    country: p?.country ?? '',
    payoutLabel: payoutLabel(s?.payout_method, s?.payout_ref),
  };
}

export async function verificationOf(userId: string): Promise<Verification> {
  if (!supabaseConfigured) return { status: 'none' };
  const { data } = await createAdminClient().from('seller_verifications').select('status, doc_type, review_note').eq('seller_id', userId).order('created_at', { ascending: false }).limit(1);
  const v = data?.[0];
  return v ? { status: v.status, docType: v.doc_type, note: v.review_note } : { status: 'none' };
}

export async function sellerOverview(userId: string) {
  const [v, drafts, questions, verification, unread] = await Promise.all([sellerDashboard(userId), draftsFor(userId), questionsForSeller(userId), verificationOf(userId), unreadCount(userId)]);
  return { v, drafts, questions, verification, unread: unread ?? 0 };
}

/* The menu counts, cheap: orders waiting for delivery and unread notifications (the full sellerDashboard is only read by the pages that show it). */
export async function sellerBadges(userId: string) {
  const [orders, unread] = await Promise.all([(await orderStore()).forUser(userId), unreadCount(userId)]);
  const toDeliver = orders.filter((o) => o.sellerId === userId && ['funded', 'in_delivery', 'overdue', 'fix_requested'].includes(o.state)).length;
  return { badges: { orders: toDeliver, notifications: unread ?? 0 }, unread: unread ?? 0 };
}

/* The seller's own listings with the redesign's fields (beta offer), newest first. '*' keeps it working before a migration adds a column. */
export async function sellerListingFlags(userId: string): Promise<Map<string, { betaFree: boolean }>> {
  const out = new Map<string, { betaFree: boolean }>();
  if (!supabaseConfigured) return out;
  const { data } = await createAdminClient().from('products').select('*').eq('seller_id', userId).neq('status', 'draft').limit(200);
  for (const r of (data ?? []) as { slug: string; beta_free_ok?: boolean | null }[]) out.set(r.slug, { betaFree: !!r.beta_free_ok });
  return out;
}

/* Views and Buy clicks on the seller's listings over the last 30 days (visitor analytics keys products by their slug). */
export async function sellerStats(slugs: string[], now = Date.now()) {
  const { top } = await import('../analytics');
  const { dayOf } = await import('../analyticsCore');
  const from = dayOf(now - 29 * 86_400_000),
    to = dayOf(now);
  const [views, buys] = await Promise.all([top('product', from, to, 500), top('buy', from, to, 500)]);
  const mine = new Set(slugs);
  const by = new Map<string, { views: number; people: number; buys: number }>();
  for (const v of views) if (mine.has(v.key)) by.set(v.key, { views: v.total, people: v.people, buys: 0 });
  for (const b of buys) if (mine.has(b.key)) by.set(b.key, { ...(by.get(b.key) ?? { views: 0, people: 0, buys: 0 }), buys: b.people });
  return by;
}

export const sellerNotes = (userId: string) => notificationsFor(userId, 100);

/* Each listing's planned or running sale, by slug (owner, 2026-11-08). */
export async function sellerSales(userId: string) {
  if (!supabaseConfigured) return new Map();
  const { data } = await createAdminClient().from('products').select('id, slug').eq('seller_id', userId).neq('status', 'draft').limit(200);
  const { openSalesBySlug } = await import('../prices/service');
  return openSalesBySlug((data ?? []) as { id: string; slug: string }[]);
}
