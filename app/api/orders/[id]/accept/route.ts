import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordConsent, whoIs } from '@/lib/consent';
import { accept, getOrder } from '@/lib/orders/service';
import { createClient } from '@/lib/supabase/server';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

const schema = z.object({ consent: z.literal(true) });

/* The buyer accepts a delivered order. Only the buyer of that order can, with the box ticked (logged as evidence). The state machine decides whether it is allowed now. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const id = await idOf(params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const order = await getOrder(id);
  if (!order || order.buyerId !== user.id) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.state !== 'delivered') return NextResponse.json({ error: 'This order is not ready to accept.' }, { status: 409 });
  const body = await readJson(req, schema, { allowEmpty: true });
  if (!body.ok) return NextResponse.json({ error: 'Tick the box to accept the order.' }, { status: 400 });
  await recordConsent({ orderId: id, userId: user.id, ...whoIs(req) });
  const r = await accept(id, user.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
