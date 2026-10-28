import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { describe, expect, it, vi } from 'vitest';
import { sessionCookieOptions } from '@/lib/supabase/cookieOptions';

type Written = { name: string; value: string; options: Record<string, unknown> };

/* Starts a Google sign-in on a real server client: the sign-in code is written as a cookie at once, through the same options the session uses, and nothing goes over the network. */
async function cookiesWritten(cookieOptions?: ReturnType<typeof sessionCookieOptions>) {
  const written: Written[] = [];
  const sb = createServerClient('https://stagingref000000000.supabase.co', 'anon-key', {
    ...(cookieOptions ? { cookieOptions } : {}),
    cookies: { getAll: () => [], setAll: (list) => void written.push(...(list as Written[])) },
  });
  await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://staging.example.net/auth/callback', skipBrowserRedirect: true } });
  return written;
}

describe('Supabase session cookie options (lib/supabase/cookieOptions.ts)', () => {
  it('marks the cookie Secure on a production build served over https', () => {
    expect(sessionCookieOptions(true, 'https://sellonbay.com')).toEqual({ path: '/', sameSite: 'lax', secure: true });
    expect(sessionCookieOptions(true, 'https://staging.example.net').secure).toBe(true);
  });
  it('leaves development and plain-http builds as they were', () => {
    expect(sessionCookieOptions(false, 'https://sellonbay.com').secure).toBe(false);
    expect(sessionCookieOptions(true, 'http://localhost:3000').secure).toBe(false);
  });
  it('without our options @supabase/ssr writes no Secure flag (the cause of the missing flag)', async () => {
    const w = await cookiesWritten();
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((c) => !c.options.secure && c.options.httpOnly === false)).toBe(true);
  });
  it('with our options every cookie the real client writes is Secure, SameSite Lax, path /', async () => {
    const w = await cookiesWritten(sessionCookieOptions(true, 'https://sellonbay.com'));
    expect(w.length).toBeGreaterThan(0);
    for (const c of w) expect(c.options).toMatchObject({ secure: true, sameSite: 'lax', path: '/' });
  });
  it('the browser client writes "Secure; SameSite=Lax" into document.cookie', async () => {
    const lines: string[] = [];
    const doc = {
      get cookie() {
        return '';
      },
      set cookie(v: string) {
        lines.push(v);
      },
    };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { document: doc, location: { origin: 'https://sellonbay.com', href: 'https://sellonbay.com/login' } });
    try {
      const { createBrowserClient } = await import('@supabase/ssr');
      const sb = createBrowserClient('https://stagingref000000000.supabase.co', 'anon-key', {
        cookieOptions: sessionCookieOptions(true, 'https://sellonbay.com'),
        isSingleton: false,
        auth: { autoRefreshToken: false },
      });
      await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://sellonbay.com/auth/callback', skipBrowserRedirect: true } });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l).toMatch(/;\s*Secure/i);
      expect(l).toMatch(/;\s*SameSite=Lax/i);
      expect(l).toMatch(/;\s*Path=\//i);
    }
  });
  it('the launch check flags a site address that is not https', async () => {
    const { siteAddressOk } = await import('@/lib/launchCheck');
    expect(siteAddressOk('http://sellonbay.com', true)).toBe(false);
    expect(siteAddressOk('https://sellonbay.com', true)).toBe(true);
    expect(siteAddressOk('', true)).toBe(true);
    expect(siteAddressOk('', false)).toBe(false);
  });
  it('every client that writes the session passes the options', () => {
    for (const f of ['lib/supabase/server.ts', 'lib/supabase/client.ts', 'proxy.ts']) expect(readFileSync(f, 'utf8'), f).toMatch(/cookieOptions: sessionCookieOptions\(\)/);
  });
});
