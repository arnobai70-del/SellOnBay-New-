import 'server-only';
import { betaRequests } from '../beta/service';
import { listingQueue } from '../admin/queue';
import { openDisputes } from '../disputes';
import { listPayouts } from '../payouts';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';

/* What the admin menu counts and the overview shows, from the real stores. Any one failing counts as 0 so the menu never breaks. */
const safe = async <T>(work: () => Promise<T>, fallback: T) => {
  try {
    return await work();
  } catch {
    return fallback;
  }
};

export async function pendingVerifications(): Promise<number> {
  if (!supabaseConfigured) return 0;
  const { count, error } = await createAdminClient().from('seller_verifications').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return error ? 0 : (count ?? 0);
}

export async function adminCounts() {
  const [beta, listings, disputes, payouts, verifications] = await Promise.all([
    safe(() => betaRequests({ waiting: true }), []),
    safe(listingQueue, []),
    safe(openDisputes, []),
    safe(() => listPayouts({ status: ['scheduled', 'exported'] }), []),
    safe(pendingVerifications, 0),
  ]);
  return { beta: beta.length, listings: listings.length, disputes: disputes.length, payouts: payouts.length, verifications };
}

export async function adminBadges(): Promise<Record<string, number>> {
  const c = await adminCounts();
  return { orders: c.beta, listings: c.listings, support: c.disputes, finance: c.payouts, users: c.verifications };
}

/* Display names of accounts, by id (missing ones are left out). */
export async function profileNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!supabaseConfigured || !list.length) return new Map();
  const { data } = await createAdminClient().from('profiles').select('id, full_name').in('id', list.slice(0, 500));
  return new Map((data ?? []).map((r: { id: string; full_name: string | null }) => [r.id, r.full_name || 'Account']));
}

/* Each seller's latest identity check (seller_verifications), for the payout queue. */
export async function verificationOf(sellerIds: string[]): Promise<Map<string, 'pending' | 'approved' | 'rejected'>> {
  const ids = [...new Set(sellerIds)].filter(Boolean);
  if (!supabaseConfigured || !ids.length) return new Map();
  const { data } = await createAdminClient().from('seller_verifications').select('seller_id, status, created_at').in('seller_id', ids.slice(0, 500)).order('created_at', { ascending: true });
  return new Map((data ?? []).map((r: { seller_id: string; status: 'pending' | 'approved' | 'rejected' }) => [r.seller_id, r.status]));
}

/* Accounts by role for the Users & roles page: staff with their permissions, sellers, buyers, and who is suspended or banned. */
export type AccountRow = { id: string; name: string; role: string; scopes: string[] | null; banned: boolean; suspendedUntil: number | null; createdAt: number };
export async function accountRows(): Promise<AccountRow[]> {
  if (!supabaseConfigured) return [];
  const full = await createAdminClient().from('profiles').select('id, full_name, role, admin_scopes, banned, suspended_until, created_at').order('created_at', { ascending: false }).limit(5000);
  const rows =
    (full.error
      ? (await createAdminClient().from('profiles').select('id, full_name, role, banned, suspended_until, created_at').order('created_at', { ascending: false }).limit(5000)).data
      : full.data) ?? [];
  return (rows as { id: string; full_name: string | null; role: string; admin_scopes?: string[] | null; banned: boolean | null; suspended_until: string | null; created_at: string }[]).map((r) => ({
    id: r.id,
    name: r.full_name || 'Account',
    role: r.role,
    scopes: r.admin_scopes ?? null,
    banned: !!r.banned,
    suspendedUntil: r.suspended_until ? Date.parse(r.suspended_until) : null,
    createdAt: Date.parse(r.created_at),
  }));
}
