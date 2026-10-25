import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';
import { getExtra } from '@/lib/orders/extra';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { getOrder } from '@/lib/orders/service';
import { paypalConfigured, paypalPayments } from '@/lib/providers/payment';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';

/*
 * The buyer comes back from PayPal (never closed by maintenance: the money is already on its way). Take the payment on the server, check it is
 * complete, in dollars, and for THIS order, then let the same handler a webhook uses fund the order. The webhook for the same payment has the same
 * event id, so the order is funded once whichever arrives first.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const id = q.get('order') ?? '';
  const go = (path: string) => NextResponse.redirect(`${SITE_URL}${path}`, 303);
  if (!paypalConfigured() || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return go('/');
  const order = await orderFor(id);
  if (!order || canUseDemoPayment(order)) return go('/');
  const extraId = q.get('extra') ?? '';
  const extra = extraId ? await getExtra(extraId) : null;
  // Extra work is paid into an order that is already funded; an order itself is paid once.
  if (extraId ? !extra || extra.orderId !== order.id || extra.state !== 'pending' : !!order.fundedAt) return go(`/orders/${id}`);
  const cap = await paypalPayments.captureApproved(q.get('token') ?? '');
  if (!cap.ok) {
    console.error('paypal capture refused', cap.reason);
    return go(`/pay/${id}?failed=1`);
  }
  // The payment must name this very order and the price we set.
  const back = extraId ? `/orders/${id}?failed=1` : `/pay/${id}?failed=1`;
  if (cap.orderId !== order.id || (cap.changeRequestId ?? '') !== extraId) return go(back);
  const out = await handlePaymentEvent(paypalPayments.name, {
    id: `capture_${cap.captureId}`,
    type: 'payment.succeeded',
    orderId: order.id,
    amountCents: cap.amountCents,
    ref: cap.captureId,
    at: Date.now(),
    card: { brand: 'PayPal', last4: '' },
    ...(extraId ? { changeRequestId: extraId } : {}),
  });
  if (out.status === 'rejected') return go(back);
  if (extraId) return go(`/orders/${id}`);
  const now = await getOrder(order.id);
  return go(now?.fundedAt ? `/orders/${id}` : `/pay/${id}?pending=1`);
}
