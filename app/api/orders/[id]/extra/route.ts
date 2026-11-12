import { passedCode } from '@/lib/auth/authenticator';
import { NextResponse } from 'next/server';
import { createExtra } from '@/lib/orders/extra';
import { getOrder } from '@/lib/orders/service';
import { extraSchema } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';
import { viewerBlocked } from '@/lib/supabase/viewer';
import { idOf, readJson } from '@/lib/validate';
import { guard } from '@/lib/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

/* The seller of an order asks the buyer for extra work: a title, a price and extra days. The buyer approves and pays it into escrow before any work starts. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return jsonT({ error: tx('Sign in first.') }, { status: 401 });
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!passedCode(aal)) return jsonT({ error: tx('Enter your authenticator code first.') }, { status: 403 });
  if (await viewerBlocked(user.id)) return jsonT({ error: tx('This account cannot ask for extra work right now.') }, { status: 403 });
  const g = await guard('extra', user.id);
  if (!g.ok) return jsonT({ error: g.error }, { status: g.status });
  const order = await getOrder(id);
  if (!order || order.sellerId !== user.id) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  const parsed = await readJson(req, extraSchema);
  if (!parsed.ok) return parsed.res;
  const r = await createExtra(id, user.id, parsed.data);
  if (!r.ok) return jsonT({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.request.id });
}
