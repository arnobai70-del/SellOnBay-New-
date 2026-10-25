import { NextResponse } from 'next/server';
import { cannotAct } from '@/lib/accounts';
import { sellerRemoved } from '@/lib/repoAccess';
import { createClient } from '@/lib/supabase/server';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

/* The seller says they removed the buyer from the repository after a refund or cancellation. An admin then confirms. Sellers need the authenticator code (aal2). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return no('Sign in first.', 401);
  const { data: me } = await sb.from('profiles').select('banned, suspended_until').eq('id', user.id).single();
  if (!me || cannotAct(me)) return no('This account cannot do that.', 403);
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return no('Enter your authenticator code first.', 403);
  const r = await sellerRemoved(id, user.id);
  return r.ok ? NextResponse.json({ ok: true }) : no(r.error, r.status);
}
