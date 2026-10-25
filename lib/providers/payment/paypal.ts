import 'server-only';
import { canUseDemoPayment } from '../../commerce/demoPaymentPolicy';
import { SITE_URL } from '../../site';
import { IgnoredWebhook, WebhookError, type OrderToPay, type PaymentProvider, type VerifiedEvent } from './types';

/*
 * PayPal (Orders v2). The buyer is sent to PayPal, comes back to /api/paypal/return, and only then do we capture the payment on the server.
 * Every amount is checked against our own order before anything is funded (lib/orders/payments.ts), and the order id travels in PayPal's `custom_id`,
 * which only we set. Keys come from the server's environment and are never in the code or the browser:
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox | live, default sandbox so no real money moves by accident), PAYPAL_WEBHOOK_ID.
 * Seller payouts stay the weekly batch an admin marks as paid, so releaseToSeller changes nothing at PayPal.
 */
export const paypalConfigured = () => !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
const base = () => (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
const value = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: unknown) => Math.round(Number(v) * 100);

/* PayPal's custom_id carries our ids, which only we set: "<order id>" or "<order id>:<extra work id>". */
export const customId = (orderId: string, changeRequestId?: string) => (changeRequestId ? `${orderId}:${changeRequestId}` : orderId);
export const parseCustomId = (v: string) => {
  const [orderId, changeRequestId] = v.split(':');
  return { orderId, changeRequestId: changeRequestId || undefined };
};

type Token = { value: string; until: number };
let token: Token | null = null;

async function accessToken(): Promise<string> {
  if (token && token.until > Date.now() + 30_000) return token.value;
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`PayPal sign-in failed (${r.status}). Check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV.`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function call<T>(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
  const r = await fetch(`${base()}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => ({}))) as T & { name?: string };
  if (!r.ok) throw new Error(`PayPal answered ${r.status}${j.name ? ` (${j.name})` : ''}.`);
  return j;
}

export type Captured = { ok: true; captureId: string; orderId: string; changeRequestId?: string; amountCents: number } | { ok: false; reason: string };
type CaptureBody = {
  status?: string;
  purchase_units?: { payments?: { captures?: { id: string; status: string; custom_id?: string; amount: { value: string; currency_code: string } }[] } }[];
};

export class PayPalProvider implements PaymentProvider {
  readonly name = 'paypal';

  async createCheckout(order: OrderToPay) {
    const j = await call<{ id: string; links?: { rel: string; href: string }[] }>('/v2/checkout/orders', {
      requestId: `sob-${customId(order.id, order.changeRequestId)}-${order.amountCents}-${Date.now().toString(36)}`,
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: order.id,
            custom_id: customId(order.id, order.changeRequestId),
            description: order.title.slice(0, 120),
            amount: { currency_code: order.currency || 'USD', value: value(order.amountCents) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'SellOnBay',
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: `${SITE_URL}/api/paypal/return?order=${encodeURIComponent(order.id)}${order.changeRequestId ? `&extra=${encodeURIComponent(order.changeRequestId)}` : ''}`,
              cancel_url: order.changeRequestId ? `${SITE_URL}/orders/${encodeURIComponent(order.id)}` : `${SITE_URL}/pay/${encodeURIComponent(order.id)}?cancelled=1`,
            },
          },
        },
      },
    });
    const url = j.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
    if (!url || !/^https:\/\/([a-z0-9-]+\.)*paypal\.com\//.test(url)) throw new Error('PayPal did not give a payment page.');
    return { url };
  }

  /* The buyer came back from PayPal: take the money now. Checks that the payment is complete, in dollars, and says which order it is for. */
  async captureApproved(paypalOrderId: string): Promise<Captured> {
    if (!/^[A-Z0-9]{8,32}$/i.test(paypalOrderId)) return { ok: false, reason: 'bad token' };
    let j: CaptureBody;
    try {
      j = await call<CaptureBody>(`/v2/checkout/orders/${paypalOrderId}/capture`, { method: 'POST', body: {}, requestId: `sob-capture-${paypalOrderId}` });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'capture failed' };
    }
    const cap = j.purchase_units?.[0]?.payments?.captures?.[0];
    if (j.status !== 'COMPLETED' || !cap || cap.status !== 'COMPLETED') return { ok: false, reason: 'the payment is not complete' };
    if (cap.amount.currency_code !== 'USD') return { ok: false, reason: 'wrong currency' };
    return { ok: true, captureId: cap.id, ...parseCustomId(cap.custom_id ?? ''), amountCents: toCents(cap.amount.value) };
  }

  async capture() {
    // Already taken when the buyer came back (captureApproved).
  }
  /*
   * Gives money back. A buyer may have paid in several PayPal payments (the order, then each extra work request), and PayPal refunds one payment at a
   * time, so the amount is taken from the order's payment first and then from each extra's payment, up to what PayPal says is still refundable on each.
   */
  async refund(orderId: string, amountCents: number) {
    const { getOrder, orderEvents } = await import('../../orders/service'); // loaded here: the order service itself uses this provider
    const o = await getOrder(orderId);
    if (!o || canUseDemoPayment(o)) return; // a test order never touched PayPal
    if (!o.payment?.ref) throw new Error('This order has no PayPal payment to refund.');
    const captures = [o.payment.ref, ...(await orderEvents(orderId)).filter((e) => e.event === 'extra_funded' && typeof e.meta?.ref === 'string').map((e) => String(e.meta!.ref))];
    let left = amountCents;
    for (const id of [...new Set(captures)]) {
      if (left <= 0) break;
      const cap = await call<{ amount?: { value: string }; seller_payable_breakdown?: { total_refunded_amount?: { value: string } } }>(`/v2/payments/captures/${encodeURIComponent(id)}`);
      const room = toCents(cap.amount?.value ?? 0) - toCents(cap.seller_payable_breakdown?.total_refunded_amount?.value ?? 0);
      const part = Math.min(left, room);
      if (part <= 0) continue;
      await call(`/v2/payments/captures/${encodeURIComponent(id)}/refund`, {
        requestId: `sob-refund-${orderId}-${id}-${part}-${o.refundedCents}`,
        body: { amount: { value: value(part), currency_code: 'USD' } },
      });
      left -= part;
    }
    if (left > 0) throw new Error('PayPal holds less than the amount to refund. Refund the rest in PayPal by hand.');
  }
  /* Pays a seller's weekly payout to their PayPal email (PayPal Payouts, which must be switched on for the business account). One batch per payout id: PayPal refuses the same id twice. */
  async sendPayout(i: { id: string; email: string; amountCents: number }): Promise<{ batchId: string }> {
    const j = await call<{ batch_header?: { payout_batch_id?: string } }>('/v1/payments/payouts', {
      body: {
        sender_batch_header: { sender_batch_id: i.id, email_subject: 'Your SellOnBay payout', email_message: 'Your weekly SellOnBay earnings.' },
        items: [{ recipient_type: 'EMAIL', receiver: i.email, amount: { value: value(i.amountCents), currency: 'USD' }, sender_item_id: i.id, note: 'SellOnBay weekly payout' }],
      },
    });
    const batchId = j.batch_header?.payout_batch_id;
    if (!batchId) throw new Error('PayPal did not accept the payout.');
    return { batchId };
  }
  /* paid: the money reached the seller; failed: PayPal refused or returned it; pending: still on its way. */
  async payoutStatus(batchId: string): Promise<'paid' | 'failed' | 'pending'> {
    if (!/^[A-Za-z0-9]{6,40}$/.test(batchId)) return 'pending';
    const j = await call<{ batch_header?: { batch_status?: string } }>(`/v1/payments/payouts/${batchId}`);
    const s = j.batch_header?.batch_status;
    if (s === 'SUCCESS') return 'paid';
    if (s === 'DENIED' || s === 'CANCELED') return 'failed';
    return 'pending';
  }
  async releaseToSeller() {
    // Weekly payouts are batches an admin sends and marks as paid.
  }

  async parseWebhook(req: Request): Promise<VerifiedEvent> {
    const raw = await req.text();
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) throw new WebhookError('PAYPAL_WEBHOOK_ID is not set.');
    let event: { event_type?: string; resource?: unknown; create_time?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      throw new WebhookError('Not JSON.');
    }
    const h = (n: string) => req.headers.get(n) ?? '';
    const v = await call<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
      body: {
        auth_algo: h('paypal-auth-algo'),
        cert_url: h('paypal-cert-url'),
        transmission_id: h('paypal-transmission-id'),
        transmission_sig: h('paypal-transmission-sig'),
        transmission_time: h('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: event,
      },
    }).catch(() => ({ verification_status: 'FAILURE' }));
    if (v.verification_status !== 'SUCCESS') throw new WebhookError('The signature is not genuine.');
    const res = (event.resource ?? {}) as { id?: string; custom_id?: string; amount?: { value: string }; links?: { rel: string; href: string }[] };
    const at = event.create_time ? Date.parse(event.create_time) : Date.now();
    // The same id as the return route uses, so a payment seen by both is funded once.
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && res.id && res.custom_id && res.amount)
      return { id: `capture_${res.id}`, type: 'payment.succeeded', ...parseCustomId(res.custom_id), amountCents: toCents(res.amount.value), ref: res.id, at };
    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && res.id && res.amount) {
      // A refund names the payment it belongs to, not our order: read that payment to find the order id.
      const up = res.links?.find((l) => l.rel === 'up')?.href ?? '';
      const m = /\/v2\/payments\/captures\/([A-Za-z0-9]+)$/.exec(up);
      const cap = m ? await call<{ custom_id?: string; id: string }>(`/v2/payments/captures/${m[1]}`).catch(() => null) : null;
      if (!cap?.custom_id) throw new WebhookError('Cannot tell which order this refund is for.');
      return { id: `refund_${res.id}`, type: 'refund.succeeded', orderId: parseCustomId(cap.custom_id).orderId, amountCents: toCents(res.amount.value), ref: cap.id, at };
    }
    throw new IgnoredWebhook(event.event_type ?? 'unknown');
  }
}
