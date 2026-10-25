import { derivedSecret } from '../../secrets';
import { DEMO_OTP, TEST_CARDS } from '../../commerce/testcards';
import { sign, verify } from './signature';
import type { OrderToPay, PaymentProvider, VerifiedEvent } from './types';

/* Test mode. Test cards only (see lib/commerce/testcards.ts): a real card number is refused on purpose. Records every call so tests can look. */
export type CardInput = { number: string; exp: string; cvc: string; name: string };
export type ChargeResult =
  { ok: true; ref: string; brand: string; last4: string } | { ok: false; code: 'invalid' | 'declined' | 'insufficient_funds' | 'requires_action' | 'bad_otp'; message: string };

const digits = (s: string) => s.replace(/\D/g, '');
const rid = () => Math.random().toString(36).slice(2, 10).toUpperCase();

export const webhookSecret = () => {
  const s = derivedSecret('PAYMENT_WEBHOOK_SECRET');
  if (s) return s;
  if (process.env.NODE_ENV === 'production') return ''; // never fall back to a known secret in production
  return 'fake-webhook-secret-for-local-tests';
};

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  calls: { method: string; args: unknown[] }[] = [];
  private note(method: string, ...args: unknown[]) {
    this.calls.push({ method, args });
  }

  async createCheckout(order: OrderToPay) {
    this.note('createCheckout', order.id, order.amountCents);
    return { url: `/pay/${order.id}` }; // our own demo payment page plays the provider's hosted page
  }
  async capture(orderId: string) {
    this.note('capture', orderId);
  }
  async refund(orderId: string, amountCents: number) {
    this.note('refund', orderId, amountCents);
  }
  async releaseToSeller(orderId: string, amountCents: number) {
    this.note('releaseToSeller', orderId, amountCents);
  }
  async parseWebhook(req: Request): Promise<VerifiedEvent> {
    return verify(webhookSecret(), await req.text(), req.headers.get('sellonbay-signature'));
  }

  /* Test mode only: what a card form does. Checks the card and returns the event the provider would send afterwards. */
  async chargeTestCard(i: { orderId: string; amountCents: number; card: CardInput; otp?: string }): Promise<ChargeResult> {
    const { amountCents, card, otp } = i;
    const n = digits(card.number);
    const t = TEST_CARDS[n];
    if (!t) return { ok: false, code: 'invalid', message: 'This is a demo gateway. Use one of the test cards, never a real card.' };
    const m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(card.exp.trim());
    if (!m || +m[1] < 1 || +m[1] > 12) return { ok: false, code: 'invalid', message: 'Check the expiry date (MM/YY).' };
    const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    if (new Date(y, +m[1], 1).getTime() < Date.now()) return { ok: false, code: 'invalid', message: 'This card has expired.' };
    if (!/^\d{3,4}$/.test(card.cvc.trim())) return { ok: false, code: 'invalid', message: 'Check the security code.' };
    if (card.name.trim().length < 2) return { ok: false, code: 'invalid', message: 'Add the name on the card.' };
    if (amountCents <= 0) return { ok: false, code: 'invalid', message: 'Nothing to pay.' };
    if (t.outcome === 'declined') return { ok: false, code: 'declined', message: 'Your card was declined. Try another card.' };
    if (t.outcome === 'insufficient_funds') return { ok: false, code: 'insufficient_funds', message: 'Your card has insufficient funds.' };
    if (t.outcome === 'otp') {
      if (!otp) return { ok: false, code: 'requires_action', message: 'Your bank needs to confirm this payment.' };
      if (otp !== DEMO_OTP) return { ok: false, code: 'bad_otp', message: 'That code is not right. Try again.' };
    }
    return { ok: true, ref: 'pay_fake_' + rid(), brand: 'Visa', last4: n.slice(-4) };
  }
}

/* Builds a signed webhook the way the provider would send it. Used by the demo pay page and by tests. */
export function signedEvent(ev: VerifiedEvent, secret = webhookSecret(), nowSeconds?: number) {
  const body = JSON.stringify(ev);
  return { body, signature: sign(secret, body, nowSeconds) };
}
