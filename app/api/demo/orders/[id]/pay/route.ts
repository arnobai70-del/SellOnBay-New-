import { NextResponse } from 'next/server';
import { orderFor } from '@/lib/commerce/access';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';
import { domainProvider } from '@/lib/providers/domain';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { countAttempt, getOrder } from '@/lib/orders/service';
import { isFundedState } from '@/lib/orders/machine';
import { fakePayments } from '@/lib/providers/payment';
import { paySchema } from '@/lib/schemas';
import { idOf, readJson } from '@/lib/validate';
import { bump } from '@/lib/metrics';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const MAX_TRIES = 8;

/* Charge the card through the payment provider. The card is checked and then thrown away: only the brand and last 4 digits are kept. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('checkout'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const found = await orderFor(await idOf(params));
  if (!found) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  // Never allow a fake card event to create escrow/entitlements for a real seller or developer.
  // This applies even to already-funded orders and regardless of NODE_ENV.
  if (!canUseDemoPayment(found))
    return NextResponse.json({ error: 'Test-card payments are only available for example products. Live checkout is not connected yet.' }, { status: 403 });
  if (found.state !== 'awaiting_payment') return NextResponse.json({ ok: true, already: true });
  if (found.attempts >= MAX_TRIES) return NextResponse.json({ error: 'Too many tries. Start the order again.' }, { status: 429 });
  const parsed = await readJson(req, paySchema, { allowEmpty: true });
  if (!parsed.ok) return parsed.res;
  const b = parsed.data;
  const card = { number: String(b.card?.number ?? ''), exp: String(b.card?.exp ?? ''), cvc: String(b.card?.cvc ?? ''), name: String(b.card?.name ?? '') };

  // A new domain is checked again right before charging, so nobody pays for a name that has just gone.
  if (found.domain?.source === 'new') {
    const name = found.domain.name;
    const dot = name.indexOf('.');
    const hit = (await domainProvider().search(name.slice(0, dot))).find((r) => r.tld === name.slice(dot));
    if (!hit?.available) return NextResponse.json({ error: `${name} is no longer available. Nothing was charged.`, code: 'domain_gone' }, { status: 409 });
  }

  const o = await countAttempt(found);
  const r = await fakePayments.chargeTestCard({ orderId: o.id, amountCents: o.priceCents, card, otp: b.otp ? String(b.otp) : undefined });
  if (!r.ok && r.code !== 'requires_action') await bump('failed_payments');
  if (!r.ok) return NextResponse.json({ error: r.message, code: r.code }, { status: r.code === 'requires_action' ? 202 : 402 });

  // The provider's "payment succeeded" event goes through the same handler a real webhook would use.
  const out = await handlePaymentEvent(fakePayments.name, {
    id: 'evt_' + r.ref,
    type: 'payment.succeeded',
    orderId: o.id,
    amountCents: o.priceCents,
    ref: r.ref,
    at: Date.now(),
    card: { brand: r.brand, last4: r.last4 },
  });
  if (out.status === 'rejected') return NextResponse.json({ error: 'This payment does not match the order. Nothing was charged.' }, { status: 409 });
  // Ignored (for example another tab moved the order first): say paid only when the order really is funded now.
  if (out.status === 'ignored') {
    const now = await getOrder(o.id);
    if (!now || !isFundedState(now.state)) return NextResponse.json({ error: 'This order changed while paying. Reload the page before trying again.' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
