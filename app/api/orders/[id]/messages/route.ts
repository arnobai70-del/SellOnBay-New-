import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cannotAct } from '@/lib/accounts';
import { listMessages, roleIn, sendMessage } from '@/lib/chat';
import { clientIp } from '@/lib/delivery/service';
import { getOrder } from '@/lib/orders/service';
import { createClient } from '@/lib/supabase/server';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ body: z.string().max(4000) });

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
    if (aal?.currentLevel !== 'aal2') return { error: 403 as const };
  }
  return { error: undefined, o, role, userId: user.id };
}
const refuse = (status: 401 | 403 | 404) => NextResponse.json({ error: status === 401 ? 'Sign in first.' : status === 403 ? 'Not allowed.' : 'Order not found.' }, { status });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await party(await idOf(params));
  if (a.error) return refuse(a.error);
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0) || 0;
  return NextResponse.json({ messages: await listMessages(a.o.id, since), now: Date.now(), role: a.role }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await party(await idOf(params));
  if (a.error) return refuse(a.error);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await sendMessage(a.o, a.role, a.userId, clientIp(req), body.data.body);
  return r.ok ? NextResponse.json({ ok: true, message: r.message }) : NextResponse.json({ error: r.error, blocked: r.blocked ?? false }, { status: r.status });
}
