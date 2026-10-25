import { NextResponse } from 'next/server';
import { BLOCKED_MESSAGE, checkMessage } from '@/lib/chatFilter';
import { clientIp } from '@/lib/delivery/service';
import { limit } from '@/lib/rateLimit';
import { saveBlocked, saveReply } from '@/lib/presale/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { replySchema } from '@/lib/schemas';
import { readJson } from '@/lib/validate';
import { cannotAct } from '@/lib/accounts';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

/* A seller answers a pre-sale question. Same chat filter, same blocked-message list. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('messaging'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  if (!supabaseConfigured) return fail('Replies need a signed-in seller account.', 401);
  const ip = clientIp(req);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('Sign in first.', 401);
  const { data: me } = await sb.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
  if (!me || cannotAct(me) || (me.role !== 'seller' && me.role !== 'admin')) return fail('Only the seller can reply.', 403);
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return fail('Enter your authenticator code first.', 403);
  if (!(await limit(`reply:${user.id}`, 20, 60 * 60_000))) return fail('Too many replies. Try again in a while.', 429);

  const parsed = await readJson(req, replySchema);
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;
  const reply = String(b?.reply ?? '').trim();
  if (!b?.id || reply.length < 2 || reply.length > 600) return fail('Write a reply of 2 to 600 characters.', 400);
  const verdict = checkMessage(reply);
  if (!verdict.ok) {
    await saveBlocked({ senderId: user.id, sellerId: user.id, productKey: '', body: reply, reason: verdict.reason, ip, context: 'presale_reply' });
    return fail(BLOCKED_MESSAGE, 422, { blocked: true });
  }
  if (!(await saveReply(user.id, b.id, reply, me.role === 'admin'))) return fail('That question was not found.', 404);
  return NextResponse.json({ ok: true });
}
