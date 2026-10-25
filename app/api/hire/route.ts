import { NextResponse } from 'next/server';
import { isBlocked } from '@/lib/chatFilter';
import { DEVS, trialOf } from '@/lib/developers';
import { examplesBuyable } from '@/lib/examples';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { hireSchema } from '@/lib/schemas';
import { readJson } from '@/lib/validate';
import { BUYERS_ONLY, cannotAct, mayBuy } from '@/lib/accounts';
import { accountLockedOut } from '@/lib/supabase/viewer';
import { guard } from '@/lib/guard';
import { PAUSED_TEXT, checkoutPausedFor } from '@/lib/switches';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/* A buyer sends a brief and picks a package. Price and days come from the developer's saved packages, never from the browser. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('Sign in first.', 401);
  const { data: me } = await sb.from('profiles').select('banned, suspended_until, role').eq('id', user.id).single();
  if (cannotAct(me)) return fail('This account cannot place orders.', 403);
  if (!mayBuy(me?.role)) return fail(BUYERS_ONLY, 403);
  const g = await guard('hire', user.id);
  if (!g.ok) return fail(g.error, g.status);
  if (await checkoutPausedFor(user.id)) return fail(PAUSED_TEXT, 503);

  const parsed = await readJson(req, hireSchema);
  if (!parsed.ok) return parsed.res;
  const body = parsed.data;
  const brief = String(body?.brief ?? '').trim();
  if (brief.length < 20 || brief.length > 2000) return fail('Write 20 to 2000 characters about what you need.');
  if (isBlocked(brief)) return fail('Keep emails, phone numbers and outside payment talk out of the brief.');

  const admin = createAdminClient();
  const starter = DEVS.find((d) => d.id === body?.dev);
  if (starter && !examplesBuyable()) return fail('This is an example profile. We made it to show how hiring works, so it cannot be hired.', 400);
  // The profile page hides the hire button for a fully booked developer; the server keeps to the same rule.
  if (starter?.avail === 'Booked') return fail('This developer is fully booked right now. Try again later or pick another developer.', 409);
  let packs = starter?.packs;
  let devUser: string | null = null;
  let ownTrial: { price: number; days: number } | undefined;
  if (!packs) {
    const { data } = await admin
      .from('dev_profiles')
      .select('user_id, packs, status, avail, trial_price_cents, trial_days')
      .eq('handle', String(body?.dev ?? ''))
      .maybeSingle();
    if (!data || data.status !== 'live' || (await accountLockedOut(data.user_id))) return fail('That developer is not available.', 404);
    if (data.avail === 'Booked') return fail('This developer is fully booked right now. Try again later or pick another developer.', 409);
    packs = data.packs;
    devUser = data.user_id;
    ownTrial = data.trial_price_cents && data.trial_days ? { price: Math.round(data.trial_price_cents / 100), days: data.trial_days } : undefined;
  }
  if (devUser === user.id) return fail('You cannot hire yourself.');
  const pack = body?.pack === 'Trial' ? trialOf({ packs: packs!, trial: ownTrial }) : packs!.find((p) => p.name === body?.pack);
  if (!pack) return fail('Pick a package.');

  const { error } = await admin
    .from('hire_requests')
    .insert({ buyer_id: user.id, dev_key: String(body?.dev), dev_user_id: devUser, pack: pack.name, price_cents: pack.price * 100, days: pack.days, brief });
  if (error) return fail('Could not save your request. Try again.', 500);
  return NextResponse.json({ ok: true });
}
