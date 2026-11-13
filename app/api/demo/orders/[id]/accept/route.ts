import { NextResponse } from 'next/server';
import { z } from 'zod';
import { orderFor } from '@/lib/commerce/access';
import { recordConsent, whoIs } from '@/lib/consent';
import { accept } from '@/lib/orders/service';
import { getViewerId } from '@/lib/supabase/viewer';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const ACCEPTED: string[] = ['accepted', 'payout_pending', 'paid_out'];
const schema = z.object({ consent: z.literal(true, { error: 'Tick the box to accept the order.' }) });

/* The buyer accepts a delivered order. The box next to the button must be ticked; the click is logged (time, address, browser, device) as evidence. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  // Accepting twice (a double click, a resend) is the same acceptance: answer ok and change nothing.
  if (ACCEPTED.includes(o.state)) return NextResponse.json({ ok: true, already: true });
  if (o.state !== 'delivered') return jsonT({ error: tx('This order is not ready to accept.') }, { status: 409 });
  const body = await readJson(req, schema, { allowEmpty: true });
  if (!body.ok) return jsonT({ error: tx('Tick the box to accept the order.') }, { status: 400 });
  const viewer = (await getViewerId()) ?? null;
  const r = await accept(o.id, viewer);
  if (!r.ok) {
    // Lost a race with another click that accepted it: that one is the acceptance.
    const now = await orderFor(o.id);
    if (now && ACCEPTED.includes(now.state)) return NextResponse.json({ ok: true, already: true });
    return jsonT({ error: r.error }, { status: r.status });
  }
  // Logged once, for the click that accepted the order (time, address, browser, device), as evidence.
  await recordConsent({ orderId: o.id, userId: viewer, ...whoIs(req) });
  return NextResponse.json({ ok: true });
}
