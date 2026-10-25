import { NextResponse } from 'next/server';
import { NEEDS_DEMO } from '@/lib/apps';
import { deliverySecret } from '@/lib/delivery/service';
import { limit } from '@/lib/rateLimit';
import { signToken } from '@/lib/delivery/token';
import { flags } from '@/lib/flags';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { CONFIG, DAY_MS } from '@/lib/config';
import { idOf } from '@/lib/validate';
import { BUYERS_ONLY, cannotAct, mayBuy } from '@/lib/accounts';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const TRIAL_TTL = CONFIG.trialCopy.linkMinutes * 60;
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

/*
 * A buyer asks for the seller's limited trial copy of a code or automation product, before paying.
 * Behind FEATURE_TRIAL_COPY. Rules: signed in, one trial per buyer per product per 7 days, a one-hour signed link, every download logged.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  if (!flags.trialCopy || !supabaseConfigured) return fail('Not found.', 404);
  const id = await idOf(params);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('Sign in to try a limited copy.', 401);
  const { data: me } = await sb.from('profiles').select('banned, suspended_until, role').eq('id', user.id).single();
  if (cannotAct(me)) return fail('This account cannot download trials.', 403);
  if (!mayBuy(me?.role)) return fail(BUYERS_ONLY, 403);

  const admin = createAdminClient();
  const { data: p } = await admin.from('products').select('id, seller_id, status, category, platform, trial_url').eq('slug', id).maybeSingle();
  if (!p || p.status !== 'live' || !p.trial_url || p.platform !== 'digital' || !NEEDS_DEMO.includes(p.category)) return fail('This listing has no trial copy.', 404);
  if (p.seller_id === user.id) return fail('This is your own listing.', 400);
  if (!(await limit(`trial:${user.id}:${p.id}`, CONFIG.trialCopy.requestsPerDay, DAY_MS))) return fail('Too many requests for this trial. Try again tomorrow.', 429);
  const week = new Date(Date.now() - CONFIG.trialCopy.perBuyerProductDays * DAY_MS).toISOString();
  const { count } = await admin.from('download_events').select('id', { count: 'exact', head: true }).eq('kind', 'trial').eq('order_id', p.id).eq('user_id', user.id).gte('created_at', week);
  if ((count ?? 0) >= 1) return fail('You already tried this one this week. Buy it to get the full version.', 429);

  const token = signToken(deliverySecret(), { o: p.id, u: user.id, k: 'trial' }, TRIAL_TTL);
  return NextResponse.json({ url: `/api/download/${token}`, expiresAt: new Date(Date.now() + TRIAL_TTL * 1000).toISOString() }, { headers: { 'cache-control': 'no-store' } });
}
