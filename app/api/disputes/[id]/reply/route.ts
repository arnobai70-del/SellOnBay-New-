import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDispute, sellerReply } from '@/lib/disputes';
import { getOrder } from '@/lib/orders/service';
import { createClient } from '@/lib/supabase/server';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ text: z.string().max(2500) });

/* The seller of the order replies to a dispute (within 48 hours). Sellers need the authenticator code (aal2). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('disputes'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return NextResponse.json({ error: 'Enter your authenticator code first.' }, { status: 403 });
  const d = await getDispute(id);
  const o = d ? await getOrder(d.orderId) : null;
  if (!d || !o || o.sellerId !== user.id) return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await sellerReply(id, user.id, body.data.text);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
