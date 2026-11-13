import { passedCode } from '@/lib/auth/authenticator';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addEvidenceTo, getDispute } from '@/lib/disputes';
import { getOrder } from '@/lib/orders/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { cannotAct } from '@/lib/accounts';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ text: z.string().max(2500) });

/* The buyer or the seller of the order adds evidence to an open dispute. Nobody else can. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('disputes'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const notFound = () => jsonT({ error: tx('Dispute not found.') }, { status: 404 });
  // Who is asking comes first: a signed-out visitor gets the same "not found" without the dispute ever being looked up (2026-11-12).
  const sb = supabaseConfigured ? await createClient() : null;
  const user = sb ? (await sb.auth.getUser().catch(() => ({ data: { user: null } }))).data.user : null;
  if (sb && !user) return notFound();
  const d = await getDispute(id);
  const o = d ? await getOrder(d.orderId) : null;
  if (!d || !o) return notFound();
  let me: string | null = null;
  // Signed in: only the two parties, not banned or suspended, and the seller with the authenticator code. Demo mode has no accounts, so the
  // dispute id is the key (it is unguessable).
  if (sb && user) {
    if (user.id !== o.buyerId && user.id !== o.sellerId) return notFound();
    const { data: p } = await sb.from('profiles').select('banned, suspended_until').eq('id', user.id).single();
    if (!p || cannotAct(p)) return jsonT({ error: tx('Not allowed.') }, { status: 403 });
    if (user.id === o.sellerId && user.id !== o.buyerId) {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!passedCode(aal)) return jsonT({ error: tx('Enter your authenticator code first.') }, { status: 403 });
    }
    me = user.id;
  }
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await addEvidenceTo(id, me, body.data.text);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
