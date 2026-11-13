import { passedCode } from '@/lib/auth/authenticator';
import { NextResponse } from 'next/server';
import { cannotAct } from '@/lib/accounts';
import { listMessages, roleIn } from '@/lib/chat';
import { getOrder } from '@/lib/orders/service';
import { createClient } from '@/lib/supabase/server';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

/* Who is asking: a signed-in buyer or seller of this order. Sellers need the authenticator code (aal2). Anybody else gets "not found". */
async function party(id: string) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { error: 401 as const };
  const { data: p } = await sb.from('profiles').select('banned, suspended_until').eq('id', user.id).single();
  if (!p || cannotAct(p)) return { error: 403 as const };
  const o = await getOrder(id);
  const role = o ? roleIn(o, user.id) : null;
  if (!o || !role) return { error: 404 as const };
  if (role === 'seller') {
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!passedCode(aal)) return { error: 403 as const };
  }
  return { error: undefined, o, role, userId: user.id };
}
const refuse = (status: 401 | 403 | 404) => jsonT({ error: status === 401 ? 'Sign in first.' : status === 403 ? 'Not allowed.' : 'Order not found.' }, { status });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await party(await idOf(params));
  if (a.error) return refuse(a.error);
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  return NextResponse.json({ messages: await listMessages(a.o.id, since), now: Date.now(), role: a.role }, { headers: { 'cache-control': 'no-store' } });
}

/*
 * SellOnBay 2.0 (owner decision D-B): buyers and sellers no longer write to each other. This old chat stays readable to its two participants;
 * new messages go to SellOnBay through /api/conversations/order/<id>. The old sending code is in git history before SellOnBay 2.0.
 */
export async function POST() {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  return jsonT({ error: tx('Messages now go through SellOnBay. Use "Messages with SellOnBay" on the order.') }, { status: 410 });
}
