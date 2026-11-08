import { describe, expect, it, vi } from 'vitest';
import { EMAIL_ROUTES, emailAllowed, emailSenderFor, maskEmail } from '@/lib/emailRouting';
import { heldEmail } from '@/lib/providers/email';
import { ZeptoMailProvider, zeptoConfigured, zeptoHost, zeptoToken } from '@/lib/providers/email/zeptomail';

const FAKE_KEY = 'fake-key-for-the-test-only-0000';

describe('email routing (owner, 2026-11-07)', () => {
  it('has one address per purpose', () => {
    expect(EMAIL_ROUTES).toEqual({
      sales: 'sales@sellonbay.com',
      support: 'support@sellonbay.com',
      billing: 'billing@sellonbay.com',
      business: 'business@sellonbay.com',
      report: 'report@sellonbay.com',
      dev: 'dev@sellonbay.com',
      administrator: 'administrator@sellonbay.com',
    });
    expect(emailSenderFor()).toBe('SellOnBay <support@sellonbay.com>');
  });

  it('only lets our own and test addresses through until launch', () => {
    expect(emailAllowed('sales@sellonbay.com', {})).toBe(true);
    expect(emailAllowed('SellOnBay <dev@sellonbay.com>', {})).toBe(true);
    expect(emailAllowed('buyer1@test.sellonbay.dev', {})).toBe(true);
    expect(emailAllowed('a.stranger@gmail.com', {})).toBe(false);
    expect(emailAllowed('sellonbay.com@evil.example', {})).toBe(false);
    expect(emailAllowed('Me@Example.com', { EMAIL_ALLOW_TO: 'me@example.com, other@example.com' })).toBe(true);
    expect(emailAllowed('a.stranger@gmail.com', { EMAIL_ALLOW_ALL: '1' })).toBe(true);
    expect(maskEmail('a.stranger@gmail.com')).toBe('a.***@gmail.com');
  });

  it('holds an email to anyone else: logged with the address masked, reported as handled, nothing sent', async () => {
    const send = vi.fn(async () => {});
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const guarded = heldEmail({ name: 'real', send }, {});
    await guarded.send({ to: 'a.stranger@gmail.com', subject: 'Your order', text: 'Private words' });
    expect(send).not.toHaveBeenCalled();
    const line = JSON.stringify(log.mock.calls);
    expect(line).toContain('a.***@gmail.com');
    expect(line).not.toContain('a.stranger');
    expect(line).not.toContain('Private words');
    await guarded.send({ to: 'sales@sellonbay.com', subject: 'New request', text: 'x' });
    expect(send).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe('ZeptoMail', () => {
  const ok = () => vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('{}', { status: 201 }));

  it('sends through the API with the key in the header and the address from routing', async () => {
    const http = ok();
    const p = new ZeptoMailProvider(FAKE_KEY, 'api.zeptomail.com', emailSenderFor(), http as unknown as typeof fetch);
    await p.send({ to: 'buyer1@test.sellonbay.dev', subject: 'Hello', text: 'Words', idempotencyKey: 'n/1', replyTo: emailSenderFor('billing') });
    const [url, init] = http.mock.calls[0];
    expect(url).toBe('https://api.zeptomail.com/v1.1/email');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Zoho-enczapikey ${FAKE_KEY}`);
    expect(JSON.parse(init!.body as string)).toEqual({
      from: { address: 'support@sellonbay.com', name: 'SellOnBay' },
      to: [{ email_address: { address: 'buyer1@test.sellonbay.dev' } }],
      reply_to: [{ address: 'billing@sellonbay.com', name: 'SellOnBay' }],
      subject: 'Hello',
      textbody: 'Words',
      client_reference: 'n/1',
    });
  });

  it('accepts a key given with its scheme word, and never puts it in an error', async () => {
    const http = ok();
    await new ZeptoMailProvider(`Zoho-enczapikey ${FAKE_KEY}`, 'h.example', emailSenderFor(), http as unknown as typeof fetch).send({ to: 'a@test.sellonbay.dev', subject: 's', text: 't' });
    expect((http.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe(`Zoho-enczapikey ${FAKE_KEY}`);
    const bad = vi.fn(async () => new Response('nope', { status: 401 }));
    await expect(new ZeptoMailProvider(FAKE_KEY, 'h.example', emailSenderFor(), bad as unknown as typeof fetch).send({ to: 'a@test.sellonbay.dev', subject: 's', text: 't' })).rejects.toThrow(
      /^Email provider rejected/,
    );
  });

  it('reads its settings safely', () => {
    expect(zeptoHost({})).toBe('api.zeptomail.com');
    expect(zeptoHost({ ZEPTOMAIL_HOST: 'https://api.zeptomail.eu/' })).toBe('api.zeptomail.eu');
    expect(zeptoHost({ ZEPTOMAIL_HOST: 'evil.example/path?x=' })).toBe('api.zeptomail.com');
    expect(zeptoConfigured({})).toBe(false);
    expect(zeptoConfigured({ ZEPTOMAIL_API_KEY: FAKE_KEY })).toBe(true);
  });
});

describe('the ZeptoMail token (owner, 2026-11-09)', () => {
  const TOKEN = 'wSsVR61z' + 'x'.repeat(40);
  it('takes it with or without the "Zoho-enczapikey " prefix, trims whitespace, and sends the prefix exactly once', async () => {
    expect(zeptoToken(TOKEN)).toBe(TOKEN);
    expect(zeptoToken(`Zoho-enczapikey ${TOKEN}`)).toBe(TOKEN);
    expect(zeptoToken(`  zoho-enczapikey   ${TOKEN} \n`)).toBe(TOKEN);
    expect(zeptoToken(`\t${TOKEN}  `)).toBe(TOKEN);
    for (const raw of [TOKEN, `Zoho-enczapikey ${TOKEN}`, ` ${TOKEN}\n`]) {
      const http = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('{}', { status: 201 }));
      await new ZeptoMailProvider(raw, 'h.example', emailSenderFor(), http as unknown as typeof fetch).send({ to: 'a@test.sellonbay.dev', subject: 's', text: 't' });
      expect((http.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe(`Zoho-enczapikey ${TOKEN}`);
    }
  });
  it('a prefix with no token is not a configured key', () => {
    expect(zeptoConfigured({ ZEPTOMAIL_API_KEY: 'Zoho-enczapikey ' })).toBe(false);
    expect(zeptoConfigured({ ZEPTOMAIL_API_KEY: `Zoho-enczapikey ${TOKEN}` })).toBe(true);
    expect(zeptoConfigured({ ZEPTOMAIL_API_KEY: TOKEN })).toBe(true);
  });
});

describe('email works with ZeptoMail alone (owner, 2026-11-09)', () => {
  it('in production, a ZeptoMail key with no RESEND_* setting gives the ZeptoMail provider', async () => {
    const keep = { ...process.env };
    try {
      for (const k of Object.keys(process.env)) if (k.startsWith('RESEND_') || k === 'EMAIL_PROVIDER') delete process.env[k];
      Object.assign(process.env, { NODE_ENV: 'production', ZEPTOMAIL_API_KEY: 'Zoho-enczapikey ' + 'k'.repeat(40) });
      const { emailProvider } = await import('@/lib/providers/email');
      expect(emailProvider().name).toBe('zeptomail');
    } finally {
      process.env = keep;
    }
  });
  it('no page or check needs a RESEND_* setting', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('lib/admin/system.ts', 'utf8')).not.toMatch(/RESEND_/);
    expect(readFileSync('lib/admin/system.ts', 'utf8')).toMatch(/emailReachable\(emailProvider\(\)\.name\)/);
  });
});
