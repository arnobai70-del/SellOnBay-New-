/*
 * The one door to a payment company. Nothing else in the app talks to a payment provider. Decision D1 (which provider) is still open,
 * so everything is built against this interface and tested with FakePaymentProvider. To go live, write a class that implements it
 * (Stripe Connect or the provider chosen in D1), read that provider's current docs first, and change the one line in ./index.ts.
 */
export type OrderToPay = { id: string; amountCents: number; title: string; currency: string; /* set when the payment is for extra work inside the order */ changeRequestId?: string };

/* chargeback.lost: the buyer's bank took the money back and the payment company's review went against us. The provider adapter maps its own event to this. */
export type EventType = 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'payout.paid' | 'chargeback.lost';
/* A webhook whose signature has been checked. `id` is the provider's own event id: the same id twice is the same event. */
export type VerifiedEvent = {
  id: string;
  type: EventType;
  orderId: string;
  amountCents: number;
  ref: string;
  at: number;
  card?: { brand: string; last4: string };
  /* Set when the payment is for an extra-work request inside the order, not for the order itself. */
  changeRequestId?: string;
};

export class WebhookError extends Error {}

export interface PaymentProvider {
  readonly name: string;
  /* The buyer pays: returns the address of the provider's payment page. */
  createCheckout(order: OrderToPay): Promise<{ url: string }>;
  /* Funds are held for the order (escrow). */
  capture(orderId: string): Promise<void>;
  refund(orderId: string, amountCents: number): Promise<void>;
  /* After acceptance and the hold, through the weekly payout batch. */
  releaseToSeller(orderId: string, amountCents: number): Promise<void>;
  /* Checks the signature and age of a webhook and returns what it says. Throws WebhookError if it is not genuine. */
  parseWebhook(req: Request): Promise<VerifiedEvent>;
}

/* A genuine webhook about something we do not act on (the provider sends many kinds): answered 200 so it stops retrying. */
export class IgnoredWebhook extends Error {}
