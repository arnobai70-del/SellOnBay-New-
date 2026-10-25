import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { WebhookError, type VerifiedEvent } from './types';

/*
 * Webhook signatures: header `t=<unix seconds>,v1=<hex hmac sha256 of "<t>.<raw body>">`.
 * The age check stops a recorded webhook from being sent again later (replay). The event id check (in the handler) stops a repeat inside the window.
 */
export const TOLERANCE_SECONDS = 300;

export const sign = (secret: string, body: string, nowSeconds = Math.floor(Date.now() / 1000)) => {
  const mac = createHmac('sha256', secret).update(`${nowSeconds}.${body}`).digest('hex');
  return `t=${nowSeconds},v1=${mac}`;
};

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(['payment.succeeded', 'payment.failed', 'refund.succeeded', 'payout.paid', 'chargeback.lost']),
  orderId: z.string().min(1).max(120),
  amountCents: z.number().int().nonnegative(),
  ref: z.string().max(200),
  at: z.number().int(),
  card: z.object({ brand: z.string().max(30), last4: z.string().regex(/^\d{4}$/) }).optional(),
  changeRequestId: z.string().max(120).optional(),
});

export function verify(secret: string, body: string, header: string | null, nowSeconds = Math.floor(Date.now() / 1000)): VerifiedEvent {
  if (!secret) throw new WebhookError('Webhook secret is not set.');
  const parts = Object.fromEntries((header ?? '').split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) throw new WebhookError('Missing or malformed signature.');
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) throw new WebhookError('Signature is too old.');
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  const given = Buffer.from(parts.v1);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new WebhookError('Signature does not match.');
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new WebhookError('Body is not JSON.');
  }
  const r = eventSchema.safeParse(json);
  if (!r.success) throw new WebhookError('Event has the wrong shape.');
  return r.data;
}
