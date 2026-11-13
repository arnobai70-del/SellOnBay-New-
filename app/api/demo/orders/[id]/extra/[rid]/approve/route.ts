import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';
import { getExtra } from '@/lib/orders/extra';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { fakePayments, paypalConfigured, paypalPayments } from '@/lib/providers/payment';
import { idOf, idParam } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';

const mayPayExtra = async (o: { state: string; fundedAt?: number }) => !!o.fundedAt && ['funded', 'in_delivery', 'overdue'].includes(o.state);

/* The buyer approves extra work and pays it into escrow. Demo gateway: the test card 4242 pays. A real provider would send the buyer to its payment page instead. */
export async function POST(_r: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const o = await orderFor(await idOf(params));
  if (!o) return jsonT({ error: tx('Order not found.') }, { status: 404 });
  const real = !canUseDemoPayment(o);
  if (real && !paypalConfigured()) return jsonT({ error: tx('Extra-work payments require a connected real payment provider.') }, { status: 403 });
  const rid = idParam.safeParse((await params).rid);
  const c = rid.success ? await getExtra(rid.data) : null;
  if (!c || c.orderId !== o.id) return jsonT({ error: tx('Request not found.') }, { status: 404 });
  if (c.state !== 'pending') return jsonT({ error: `This request is already ${c.state}.` }, { status: 409 });
  if (real) {
    // A real order: the buyer pays the extra work through PayPal, into escrow, before the seller starts. The price is the one the seller sent, read here.
    if (!(await mayPayExtra(o))) return jsonT({ error: tx('Extra work can only be paid on an order that is funded.') }, { status: 409 });
    try {
      const { url } = await paypalPayments.createCheckout({ id: o.id, amountCents: c.priceCents, title: `${o.title}: ${c.title}`, currency: 'USD', changeRequestId: c.id });
      return NextResponse.json({ url });
    } catch (e) {
      console.error('paypal extra failed', e instanceof Error ? e.message : e);
      return jsonT({ error: tx('PayPal could not start the payment. Nothing was charged. Please try again.') }, { status: 502 });
    }
  }
  const charge = await fakePayments.chargeTestCard({ orderId: o.id, amountCents: c.priceCents, card: { number: '4242424242424242', exp: '12/40', cvc: '123', name: 'Demo Buyer' } });
  if (!charge.ok) return jsonT({ error: charge.message }, { status: 402 });
  const out = await handlePaymentEvent(fakePayments.name, {
    id: `evt_${charge.ref}`,
    type: 'payment.succeeded',
    orderId: o.id,
    amountCents: c.priceCents,
    ref: charge.ref,
    at: Date.now(),
    changeRequestId: c.id,
  });
  if (out.status === 'rejected' || out.status === 'ignored') return jsonT({ error: out.reason ?? 'Could not fund this request.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
