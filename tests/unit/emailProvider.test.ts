import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailProvider, fakeEmail } from '@/lib/providers/email';
import { resendConfigured, ResendEmailProvider } from '@/lib/providers/email/resend';

const key = 're_1234567890abcdefghijklmnopqrstuvwxyz';
const sender = 'SellOnBay <notifications@example.com>';
const mail = {
  to: 'buyer@example.com',
  subject: 'Your order was delivered',
  text: 'You can review your order now.',
  idempotencyKey: 'notification/456e9d21-0612-425d-b931-05015a9ea630',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('transactional email provider', () => {
  it('requires deliberate opt-in and complete syntactically valid Resend credentials', () => {
    expect(resendConfigured({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: key, EMAIL_FROM: sender })).toBe(true);
    expect(resendConfigured({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: key, EMAIL_FROM: 'notifications@example.com' })).toBe(true);
    expect(resendConfigured({ EMAIL_PROVIDER: 'none', RESEND_API_KEY: key, EMAIL_FROM: sender })).toBe(false);
    expect(resendConfigured({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'bad', EMAIL_FROM: sender })).toBe(false);
    expect(resendConfigured({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: key, EMAIL_FROM: 'Bad\nSender <x@example.com>' })).toBe(false);
    expect(resendConfigured({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: key, EMAIL_FROM: 'no-domain' })).toBe(false);
  });

  it('keeps fake email as the explicit test/default provider', () => {
    vi.stubEnv('EMAIL_PROVIDER', '');
    expect(emailProvider()).toBe(fakeEmail);
    expect(emailProvider().name).toBe('fake');
  });

  it('never pretends to send when Resend was selected but has no key', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', sender);
    expect(emailProvider().name).toBe('unconfigured');
    await expect(emailProvider().send(mail)).rejects.toThrow(/not configured/);
  });

  it('refuses to simulate email delivery in real production without a configured provider', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCHBAY_DEMO', '');
    vi.stubEnv('EMAIL_PROVIDER', '');
    expect(emailProvider().name).toBe('unconfigured');
    await expect(emailProvider().send(mail)).rejects.toThrow(/not configured/);
  });

  it('selects the real provider only with all opt-in variables', () => {
    vi.stubEnv('EMAIL_PROVIDER', 'resend');
    vi.stubEnv('RESEND_API_KEY', key);
    vi.stubEnv('EMAIL_FROM', sender);
    expect(emailProvider().name).toBe('resend');
  });

  it('sends plain text with bearer auth and a persistent notification idempotency key', async () => {
    const transport = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'provider-mail-id' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const provider = new ResendEmailProvider(key, sender, transport as unknown as typeof fetch);
    await provider.send(mail);
    expect(transport).toHaveBeenCalledOnce();
    const [url, opts] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${key}`);
    expect(headers['Idempotency-Key']).toBe(mail.idempotencyKey);
    expect(JSON.parse(String(opts.body))).toEqual({
      from: sender,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    });
    expect(opts.signal).toBeDefined();
  });

  it('does not send an idempotency header when no key was supplied', async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ id: 'mail-id' }), { status: 200 }));
    const p = new ResendEmailProvider(key, sender, transport as unknown as typeof fetch);
    await p.send({ ...mail, idempotencyKey: undefined });
    const [, opts] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined();
  });

  it('rejects provider HTTP errors, missing acceptance ID and network failure', async () => {
    const errors = [
      vi.fn(async () => new Response('Invalid sender', { status: 403 })),
      vi.fn(async () => new Response('{}', { status: 200 })),
      vi.fn(async () => {
        throw new Error('network timed out');
      }),
    ];
    for (const transport of errors) {
      const p = new ResendEmailProvider(key, sender, transport as unknown as typeof fetch);
      await expect(p.send(mail)).rejects.toThrow();
    }
  });
});
