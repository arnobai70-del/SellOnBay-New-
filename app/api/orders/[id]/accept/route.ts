import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordConsent, whoIs } from '@/lib/consent';
import { accept, getOrder } from '@/lib/orders/service';
import { createClient } from '@/lib/supabase/server';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

const schema = z.object({ consent: z.literal(true) });
const ACCEPTED: string[] = ['accepted', 'payout_pending', 'paid_out'];

/* The buyer accepts a delivered order. Only the buyer of that order can, with the box ticked (logged as evidence). The state machine decides whether it is allowed now. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonT({ error: tx('Sign in first.') }, { status: 401 });
  const order = await getOrder(id);
  if (!order || order.buyerId !== user.id) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  if (ACCEPTED.includes(order.state)) return NextResponse.json({ ok: true, already: true }); // accepting twice is the same acceptance
  if (order.state !== 'delivered') return jsonT({ error: tx('This order is not ready to accept.') }, { status: 409 });
  const body = await readJson(req, schema, { allowEmpty: true });
  if (!body.ok) return jsonT({ error: tx('Tick the box to accept the order.') }, { status: 400 });
  const r = await accept(id, user.id);
  if (!r.ok) {
    const now = await getOrder(id);
    if (now && ACCEPTED.includes(now.state)) return NextResponse.json({ ok: true, already: true }); // another click accepted it first
    return jsonT({ error: r.error }, { status: r.status });
  }
  await recordConsent({ orderId: id, userId: user.id, ...whoIs(req) }); // once, for the click that accepted the order
  return NextResponse.json({ ok: true });
}
