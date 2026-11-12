import { NextResponse } from 'next/server';
import { z } from 'zod';
import { joinProgram, requestWithdrawal, updateProfile } from '@/lib/affiliates/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join'), displayName: z.string().max(60).default(''), acceptTerms: z.boolean() }),
  z.object({
    action: z.literal('profile'),
    displayName: z.string().max(60).optional(),
    publicLeaderboard: z.boolean().optional(),
    payoutMethod: z.string().max(40).optional(),
    payoutDetails: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal('withdraw'), amountCents: z.coerce.number().int() }),
]);

/*
 * The affiliate's own actions (lib/affiliates): join with an existing account, edit the profile and payout method, ask for a withdrawal.
 * Any signed-in account that is not banned; the affiliate role is separate from buyer, seller and admin.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('payouts');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  let userId = 'demo-affiliate';
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const { data: p } = await sb.from('profiles').select('banned, suspended_until').eq('id', user.id).single();
    if (!p || p.banned || (p.suspended_until && Date.parse(p.suspended_until) > Date.now())) return NextResponse.json({ error: 'This account cannot do this.' }, { status: 403 });
    userId = user.id;
  }
  if (!(await limit(`aff:${userId}`, 30, 3_600_000))) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  const b = body.data;
  const r = b.action === 'join' ? await joinProgram(userId, b.displayName, b.acceptTerms) : b.action === 'profile' ? await updateProfile(userId, b) : await requestWithdrawal(userId, b.amountCents);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
