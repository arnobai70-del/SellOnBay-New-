import { describe, expect, it } from 'vitest';
import { emailConfirmationOn } from '@/lib/authSettings';

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe('email confirmation check', () => {
  const base = { url: 'https://x.supabase.co/', anonKey: 'anon' };

  it('reads the Supabase auth setting', async () => {
    let asked = '';
    const fetcher = (async (u: string | URL | Request, init?: RequestInit) => {
      asked = `${u} ${(init?.headers as Record<string, string>).apikey}`;
      return new Response(JSON.stringify({ mailer_autoconfirm: false }));
    }) as typeof fetch;
    expect(await emailConfirmationOn({ ...base, fetcher })).toBe(true);
    expect(asked).toBe('https://x.supabase.co/auth/v1/settings anon');
    expect(await emailConfirmationOn({ ...base, fetcher: reply(200, { mailer_autoconfirm: true }) })).toBe(false);
  });

  it('says it cannot tell instead of guessing', async () => {
    expect(await emailConfirmationOn({ ...base, fetcher: reply(500, {}) })).toBeNull();
    expect(await emailConfirmationOn({ ...base, fetcher: reply(200, {}) })).toBeNull();
    expect(await emailConfirmationOn({ ...base, fetcher: (async () => Promise.reject(new Error('down'))) as typeof fetch })).toBeNull();
    expect(await emailConfirmationOn({ url: '', anonKey: 'anon' })).toBeNull();
  });
});
