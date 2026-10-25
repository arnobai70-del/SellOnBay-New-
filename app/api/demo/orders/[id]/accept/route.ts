import { NextResponse } from 'next/server';
import { z } from 'zod';
import { orderFor } from '@/lib/commerce/access';
import { recordConsent, whoIs } from '@/lib/consent';
import { accept } from '@/lib/orders/service';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ consent: z.literal(true, { error: 'Tick the box to accept the order.' }) });

/* The buyer accepts a delivered order. The box next to the button must be ticked; the click is logged (time, address, browser, device) as evidence. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (o.state !== 'delivered') return NextResponse.json({ error: 'This order is not ready to accept.' }, { status: 409 });
  const body = await readJson(req, schema, { allowEmpty: true });
  if (!body.ok) return NextResponse.json({ error: 'Tick the box to accept the order.' }, { status: 400 });
  const viewer = (await getViewerId()) ?? null;
  await recordConsent({ orderId: o.id, userId: viewer, ...whoIs(req) });
  const r = await accept(o.id, viewer);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
