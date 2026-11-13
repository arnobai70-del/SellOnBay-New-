import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';
import { maintenanceFor } from '@/lib/maintenance/service';
import { countAttempt } from '@/lib/orders/service';
import { paypalConfigured, paypalPayments } from '@/lib/providers/payment';
import { idOf, readJson } from '@/lib/validate';
import { z } from 'zod';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const MAX_TRIES = 8;
const schema = z.object({ order: z.string().min(1).max(80) });

/* The buyer chose PayPal: make the PayPal payment for this order (the amount comes from our order, never the browser) and send back its address. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  if (!paypalConfigured()) return jsonT({ error: tx('PayPal is not connected yet.') }, { status: 503 });
  const parsed = await readJson(req, schema);
  if (!parsed.ok) return parsed.res;
  const found = await orderFor(await idOf(Promise.resolve({ id: parsed.data.order })));
  if (!found) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  if (canUseDemoPayment(found)) return jsonT({ error: tx('Example products are paid with the test cards.') }, { status: 403 });
  if (found.state !== 'awaiting_payment') return NextResponse.json({ ok: true, already: true });
  if (found.attempts >= MAX_TRIES) return jsonT({ error: tx('Too many tries. Start the order again.') }, { status: 429 });
  const o = await countAttempt(found);
  try {
    const { url } = await paypalPayments.createCheckout({ id: o.id, amountCents: o.priceCents, title: o.title, currency: 'USD' });
    return NextResponse.json({ url });
  } catch (e) {
    console.error('paypal start failed', e instanceof Error ? e.message : e);
    return jsonT({ error: tx('PayPal could not start the payment. Nothing was charged. Please try again.') }, { status: 502 });
  }
}
