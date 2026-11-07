import { NextResponse } from 'next/server';
import { cannotAct } from '@/lib/accounts';
import { audit } from '@/lib/admin/audit';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/*
 * "Switch to selling" (owner, 2026-11-07): a buyer account may also sell. It becomes a seller account that can still buy, and can_sell records the choice.
 * The seller pages then ask for the authenticator code, so a stolen password alone never reaches listings or payouts. Admins never switch this way.
 */
export async function POST() {
  const closed = await maintenanceFor('auth');
  if (closed) return closed;
  if (!supabaseConfigured) return NextResponse.json({ error: 'This needs an account. There are none in demo mode.' }, { status: 404 });
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await limit(`sell-switch:${user.id}`, 5, 3_600_000))) return NextResponse.json({ error: 'Too many tries. Try again later.' }, { status: 429 });
  const admin = createAdminClient();
  const { data: p } = await admin.from('profiles').select('role, banned, suspended_until, can_sell').eq('id', user.id).single();
  if (!p || cannotAct(p)) return NextResponse.json({ error: 'This account cannot sell.' }, { status: 403 });
  if (p.role === 'admin') return NextResponse.json({ error: 'Admin accounts do not sell.' }, { status: 403 });
  if (p.role === 'seller') return NextResponse.json({ ok: true, next: '/dashboard/seller' });
  const { error } = await admin.from('profiles').update({ role: 'seller', can_sell: true }).eq('id', user.id).eq('role', 'buyer');
  if (error) return NextResponse.json({ error: 'Could not switch. Please try again.' }, { status: 500 });
  await audit(user.id, 'selling_enabled', 'profile', user.id, { from: 'buyer', to: 'seller (can still buy)' });
  return NextResponse.json({ ok: true, next: '/dashboard/seller' });
}
