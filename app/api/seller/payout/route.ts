import { NextResponse } from 'next/server';
import { cannotAct } from '@/lib/accounts';
import { audit } from '@/lib/admin/audit';
import { notify, notifyAdmins } from '@/lib/notify';
import { checkPayoutDetails, payoutLabel } from '@/lib/payoutDetails';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { limit } from '@/lib/rateLimit';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const no = (error: string, status = 400) => NextResponse.json({ error }, { status });

/*
 * A seller sets where their earnings are sent. Only here, on the server: the authenticator code is needed, banned or suspended accounts are
 * refused, every change is in the audit log, and the seller is told by notification and email, so a stolen session cannot quietly redirect payouts.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seller'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  if (!supabaseConfigured) return no('Payout details need an account. There are none in demo mode.', 404);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return no('Sign in first.', 401);
  const { data: p } = await sb.from('profiles').select('role, full_name, banned, suspended_until').eq('id', user.id).single();
  if (!p || cannotAct(p)) return no('This account cannot change payout details.', 403);
  if (p.role !== 'seller' && p.role !== 'admin') return no('Only sellers are paid out.', 403);
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return no('Enter your authenticator code first.', 403);
  if (!(await limit(`payout-details:${user.id}`, 5, 24 * 3_600_000))) return no('You changed your payout details a few times today. Try again tomorrow.', 429);

  const body = (await req.json().catch(() => null)) as { method?: unknown; account?: unknown } | null;
  const c = checkPayoutDetails(body?.method, body?.account);
  if (!c.ok) return no(c.error);

  const admin = createAdminClient();
  const { data: before } = await admin.from('seller_profiles').select('payout_method, payout_ref').eq('user_id', user.id).maybeSingle();
  const { error } = before
    ? await admin.from('seller_profiles').update({ payout_method: c.method, payout_ref: c.account }).eq('user_id', user.id)
    : await admin.from('seller_profiles').insert({ user_id: user.id, display_name: p.full_name || 'Seller', payout_method: c.method, payout_ref: c.account });
  if (error) return no('Could not save your payout details. Try again.', 500);
  const was = payoutLabel(before?.payout_method, before?.payout_ref);
  const now = payoutLabel(c.method, c.account)!;
  await audit(user.id, 'payout_details_changed', 'profile', user.id, { from: was, to: now });
  await notifyAdmins('admin_payout', {
    what: 'a seller changed their payout details',
    detail: `${p.full_name || 'A seller'}: now ${now}. Before: ${was ?? 'none'}. See Payouts in the admin dashboard.`,
  });
  await notify(user.id, 'payout_details_changed', { now, was: was ?? 'none' }, { email: true });
  return NextResponse.json({ ok: true, label: now });
}
