import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';
import { maintenanceFor } from '@/lib/maintenance/service';
import { countAttempt } from '@/lib/orders/service';
import { paypalConfigured, paypalPayments } from '@/lib/providers/payment';
import { idOf, readJson } from '@/lib/validate';
import { z } from 'zod';

export const runtime = 'nodejs';
const MAX_TRIES = 8;
const schema = z.object({ order: z.string().min(1).max(80) });

/* The buyer chose PayPal: make the PayPal payment for this order (the amount comes from our order, never the browser) and send back its address. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  if (!paypalConfigured()) return NextResponse.json({ error: 'PayPal is not connected yet.' }, { status: 503 });
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return parsed.res;
  const found = await orderFor(await idOf(Promise.resolve({ id: parsed.data.order })));
  if (!found) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (canUseDemoPayment(found)) return NextResponse.json({ error: 'Example products are paid with the test cards.' }, { status: 403 });
  if (found.state !== 'awaiting_payment') return NextResponse.json({ ok: true, already: true });
  if (found.attempts >= MAX_TRIES) return NextResponse.json({ error: 'Too many tries. Start the order again.' }, { status: 429 });
  const o = await countAttempt(found);
  try {
    const { url } = await paypalPayments.createCheckout({ id: o.id, amountCents: o.priceCents, title: o.title, currency: 'USD' });
    return NextResponse.json({ url });
  } catch (e) {
    console.error('paypal start failed', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'PayPal could not start the payment. Nothing was charged. Please try again.' }, { status: 502 });
  }
}
