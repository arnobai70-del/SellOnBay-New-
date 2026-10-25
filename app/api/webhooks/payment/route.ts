import { NextResponse } from 'next/server';
import { handlePaymentEvent } from '@/lib/orders/payments';
import { paymentProvider } from '@/lib/providers/payment';
import { IgnoredWebhook, WebhookError } from '@/lib/providers/payment/types';

export const runtime = 'nodejs';

/* The payment provider tells us what happened. The signature and age are checked before anything is read; a repeat of the same event does nothing. */
export async function POST(req: Request) {
  const provider = paymentProvider();
  let event;
  try {
    event = await provider.parseWebhook(req);
  } catch (e) {
    if (e instanceof IgnoredWebhook) return NextResponse.json({ status: 'ignored' });
    if (e instanceof WebhookError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  const out = await handlePaymentEvent(provider.name, event);
  // 200 for applied, duplicate and ignored, so the provider stops retrying; 422 when the event does not match our records
  return NextResponse.json(out, { status: out.status === 'rejected' ? 422 : 200 });
}
