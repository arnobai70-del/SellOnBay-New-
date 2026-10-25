import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayPalProvider } from '@/lib/providers/payment/paypal';
import { IgnoredWebhook, WebhookError } from '@/lib/providers/payment/types';

vi.mock('server-only', () => ({}));

type Call = { url: string; body: unknown };
let calls: Call[] = [];
let answers: Record<string, unknown> = {};

beforeEach(() => {
  calls = [];
  answers = {};
  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_CLIENT_SECRET = 'secret';
  process.env.PAYPAL_ENV = 'sandbox';
  process.env.PAYPAL_WEBHOOK_ID = 'WH1';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      const body = init?.body && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body;
      calls.push({ url, body });
      if (url.endsWith('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      const hit = Object.entries(answers).find(([k]) => url.includes(k));
      return new Response(JSON.stringify(hit ? hit[1] : {}), { status: hit ? 200 : 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('PayPal provider', () => {
  it('makes the payment from our order and returns only a paypal.com address', async () => {
    answers['/v2/checkout/orders'] = { id: 'ABC12345', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ABC12345' }] };
    const r = await new PayPalProvider().createCheckout({ id: 'ord_1', amountCents: 1234, title: 'A site', currency: 'USD' });
    expect(r.url).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\//);
    const sent = calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!.body as { purchase_units: { custom_id: string; amount: { value: string } }[] };
    expect(sent.purchase_units[0]).toMatchObject({ custom_id: 'ord_1', amount: { value: '12.34' } });
  });

  it('refuses a payment page that is not on paypal.com', async () => {
    answers['/v2/checkout/orders'] = { id: 'X', links: [{ rel: 'approve', href: 'https://evil.example/pay' }] };
    await expect(new PayPalProvider().createCheckout({ id: 'o', amountCents: 500, title: 't', currency: 'USD' })).rejects.toThrow();
  });

  it('accepts a complete payment and reports its order and amount', async () => {
    answers['/capture'] = {
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED', custom_id: 'ord_1', amount: { value: '12.34', currency_code: 'USD' } }] } }],
    };
    expect(await new PayPalProvider().captureApproved('ABC12345')).toEqual({ ok: true, captureId: 'CAP1', orderId: 'ord_1', amountCents: 1234 });
  });

  it('does not accept an incomplete payment, another currency or a strange token', async () => {
    const p = new PayPalProvider();
    answers['/capture'] = { status: 'PENDING', purchase_units: [] };
    expect((await p.captureApproved('ABC12345')).ok).toBe(false);
    answers['/capture'] = { status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'C', status: 'COMPLETED', custom_id: 'o', amount: { value: '5.00', currency_code: 'EUR' } }] } }] };
    expect((await p.captureApproved('ABC12345')).ok).toBe(false);
    expect((await p.captureApproved('../etc')).ok).toBe(false);
  });

  const hook = (event: unknown) => new Request('https://x.test/api/webhooks/payment', { method: 'POST', body: JSON.stringify(event), headers: { 'paypal-transmission-id': 't' } });

  it('turns a verified capture webhook into a payment event with the same id the return page uses', async () => {
    answers['verify-webhook-signature'] = { verification_status: 'SUCCESS' };
    const ev = await new PayPalProvider().parseWebhook(
      hook({ event_type: 'PAYMENT.CAPTURE.COMPLETED', create_time: '2026-10-23T10:00:00Z', resource: { id: 'CAP1', custom_id: 'ord_1', amount: { value: '12.34' } } }),
    );
    expect(ev).toMatchObject({ id: 'capture_CAP1', type: 'payment.succeeded', orderId: 'ord_1', amountCents: 1234, ref: 'CAP1' });
  });

  it('rejects a webhook PayPal does not vouch for, and ignores kinds we do not use', async () => {
    const p = new PayPalProvider();
    answers['verify-webhook-signature'] = { verification_status: 'FAILURE' };
    await expect(p.parseWebhook(hook({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} }))).rejects.toBeInstanceOf(WebhookError);
    answers['verify-webhook-signature'] = { verification_status: 'SUCCESS' };
    await expect(p.parseWebhook(hook({ event_type: 'BILLING.PLAN.CREATED', resource: {} }))).rejects.toBeInstanceOf(IgnoredWebhook);
  });

  it('refuses every webhook when the webhook id is not set', async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    await expect(new PayPalProvider().parseWebhook(hook({ event_type: 'PAYMENT.CAPTURE.COMPLETED' }))).rejects.toBeInstanceOf(WebhookError);
  });
});

describe('PayPal extra work and payouts', () => {
  it('carries the extra work id in the payment and reads it back', async () => {
    const { customId, parseCustomId } = await import('@/lib/providers/payment/paypal');
    expect(customId('ord', 'req')).toBe('ord:req');
    expect(parseCustomId('ord:req')).toEqual({ orderId: 'ord', changeRequestId: 'req' });
    expect(parseCustomId('ord')).toEqual({ orderId: 'ord', changeRequestId: undefined });
  });
  it('sends a payout with the payout id as the batch id and reads its status', async () => {
    answers['/v1/payments/payouts'] = { batch_header: { payout_batch_id: 'BATCH123', batch_status: 'SUCCESS' } };
    const p = new PayPalProvider();
    expect(await p.sendPayout({ id: 'pay_1', email: 's@example.com', amountCents: 4250 })).toEqual({ batchId: 'BATCH123' });
    const sent = calls.find((c) => c.url.endsWith('/v1/payments/payouts'))!.body as { sender_batch_header: { sender_batch_id: string }; items: { amount: { value: string }; receiver: string }[] };
    expect(sent.sender_batch_header.sender_batch_id).toBe('pay_1');
    expect(sent.items[0]).toMatchObject({ receiver: 's@example.com', amount: { value: '42.50' } });
    expect(await p.payoutStatus('BATCH123')).toBe('paid');
    answers['/v1/payments/payouts'] = { batch_header: { batch_status: 'PROCESSING' } };
    expect(await p.payoutStatus('BATCH123')).toBe('pending');
  });
});

describe('PayPal refunds across payments', () => {
  it('refunds the order payment first, then the extra work payment, within what PayPal still holds', async () => {
    vi.doMock('@/lib/orders/service', () => ({
      getOrder: async () => ({ id: 'ord', demo: false, kind: 'product', sellerId: 's1', productId: 'p1', payment: { ref: 'CAPMAIN' }, refundedCents: 0 }),
      orderEvents: async () => [{ event: 'extra_funded', meta: { ref: 'CAPEXTRA', priceCents: 2000 } }],
    }));
    vi.resetModules();
    const { PayPalProvider: Fresh } = await import('@/lib/providers/payment/paypal');
    answers['/v2/payments/captures/CAPMAIN'] = { amount: { value: '30.00' }, seller_payable_breakdown: { total_refunded_amount: { value: '5.00' } } };
    answers['/v2/payments/captures/CAPEXTRA'] = { amount: { value: '20.00' } };
    await new Fresh().refund('ord', 3500);
    const refunds = calls.filter((c) => c.url.endsWith('/refund')).map((c) => [c.url.split('/captures/')[1].split('/')[0], (c.body as { amount: { value: string } }).amount.value]);
    expect(refunds).toEqual([
      ['CAPMAIN', '25.00'],
      ['CAPEXTRA', '10.00'],
    ]);
    vi.doUnmock('@/lib/orders/service');
  });
});
