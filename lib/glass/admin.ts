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
