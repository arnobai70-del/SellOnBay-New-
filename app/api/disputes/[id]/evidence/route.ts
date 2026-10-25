import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addEvidenceTo, getDispute } from '@/lib/disputes';
import { getOrder } from '@/lib/orders/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { cannotAct } from '@/lib/accounts';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ text: z.string().max(2500) });

/* The buyer or the seller of the order adds evidence to an open dispute. Nobody else can. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('disputes'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const d = await getDispute(id);
  const o = d ? await getOrder(d.orderId) : null;
  if (!d || !o) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
  let me: string | null = null;
  // Signed in: only the two parties, not banned or suspended, and the seller with the authenticator code. Demo mode has no accounts, so the
  // dispute id is the key (it is unguessable).
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user || (user.id !== o.buyerId && user.id !== o.sellerId)) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
    const { data: p } = await sb.from('profiles').select('banned, suspended_until').eq('id', user.id).single();
    if (!p || cannotAct(p)) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    if (user.id === o.sellerId && user.id !== o.buyerId) {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== 'aal2') return NextResponse.json({ error: 'Enter your authenticator code first.' }, { status: 403 });
    }
    me = user.id;
  }
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await addEvidenceTo(id, me, body.data.text);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
