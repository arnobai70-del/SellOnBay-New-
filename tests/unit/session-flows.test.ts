import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionCookieOptions } from '@/lib/supabase/cookieOptions';

/*
 * The sign-in flows still work with the Secure session cookie (lib/supabase/cookieOptions.ts): Google sign-in (PKCE) through /auth/callback,
 * session refresh, the authenticator code (TOTP) and sign-out. The real @supabase/ssr and supabase-js code runs; only Supabase Auth itself is
 * a stand-in fetch. Each step reads the cookies the step before really wrote, as a browser would send them back.
 */
const SUPA = 'https://stagingref000000000.supabase.co';
const KEY = 'sb-stagingref000000000-auth-token';
const opts = sessionCookieOptions(true, 'https://sellonbay.com');
type Cookie = { name: string; value: string; options: Record<string, unknown> };

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (aal: 'aal1' | 'aal2', exp = Math.floor(Date.now() / 1000) + 3600) =>
  `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: 'u1', aud: 'authenticated', role: 'authenticated', aal, exp, session_id: 's1' })}.sig`;
const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'buyer@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' };
const session = (aal: 'aal1' | 'aal2', ttl = 3600) => {
  const expires_at = Math.floor(Date.now() / 1000) + ttl;
  return { access_token: jwt(aal, expires_at), refresh_token: `r-${aal}-${ttl}`, token_type: 'bearer', expires_in: ttl, expires_at, user };
};

/* Supabase Auth stand-in: answers the endpoints the flows call and remembers what was asked. */
function auth() {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = u.pathname.replace('/auth/v1', '') + (u.searchParams.get('grant_type') ? `?${u.searchParams.get('grant_type')}` : '');
    calls.push({ path, body });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/token?pkce') return body.auth_code === 'code-1' && body.code_verifier ? json(session('aal1')) : json({ error: 'bad' }, 400);
    if (path === '/token?refresh_token') return json(session('aal1'));
    if (path === '/user') return json(user);
    if (path === '/factors/f1/challenge') return json({ id: 'c1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (path === '/factors/f1/verify') return body.code === '123456' ? json(session('aal2')) : json({ code: 'mfa_verification_failed' }, 422);
    if (path === '/logout') return new Response(null, { status: 204 });
    return json({ error: `unexpected ${path}` }, 404);
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

/* A server client (route handler, server action or proxy) over a cookie jar; returns what it wrote. */
function server(jar: { name: string; value: string }[], f: typeof fetch) {
  const written: Cookie[] = [];
  const sb = createServerClient(SUPA, 'anon', {
    cookieOptions: opts,
    cookies: { getAll: () => jar, setAll: (list) => void written.push(...(list as Cookie[])) },
    global: { fetch: f },
    auth: { autoRefreshToken: false },
  });
  return { sb, written };
}
const back = (w: Cookie[]) => w.filter((c) => c.value && c.options.maxAge !== 0).map(({ name, value }) => ({ name, value }));
const sessionIn = (w: Cookie[]) => w.find((c) => c.name.startsWith(KEY) && !c.name.includes('code-verifier') && c.value);
const expectSecure = (w: Cookie[]) => {
  expect(w.length).toBeGreaterThan(0);
  for (const c of w) expect(c.options, c.name).toMatchObject({ secure: true, sameSite: 'lax', path: '/' });
};
/* A stored session as the cookie holds it. */
const stored = (s: ReturnType<typeof session>) => [{ name: KEY, value: 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url') }];

afterEach(() => vi.unstubAllGlobals());

describe('sign-in flows with the Secure session cookie', () => {
  it('Google sign-in: the code verifier cookie comes back to /auth/callback and the session is written Secure', async () => {
    const a = auth();
    const start = server([], a.fetch);
    const { data } = await start.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://sellonbay.com/auth/callback', skipBrowserRedirect: true } });
    expect(data.url).toContain('code_challenge=');
    expectSecure(start.written);
    // The return from Google is a top-level GET to our own site: SameSite Lax sends the verifier, Secure is fine over https.
    const cb = server(back(start.written), a.fetch);
    const { error } = await cb.sb.auth.exchangeCodeForSession('code-1');
    expect(error).toBeNull();
    expect(a.calls.find((c) => c.path === '/token?pkce')?.body.code_verifier).toBeTruthy();
    expect(sessionIn(cb.written)).toBeTruthy();
    expectSecure(cb.written);
  });

  it('refresh: an expired access token is refreshed and the new session is written Secure', async () => {
    const a = auth();
    const s = server(stored(session('aal1', -60)), a.fetch);
    const { data } = await s.sb.auth.getSession();
    expect(data.session?.refresh_token).toBe('r-aal1-3600');
    expect(a.calls.some((c) => c.path === '/token?refresh_token')).toBe(true);
    expect(sessionIn(s.written)).toBeTruthy();
    expectSecure(s.written);
  });

  it('authenticator code (TOTP, browser client): the aal2 session is written to document.cookie with Secure', async () => {
    const a = auth();
    const lines: string[] = [];
    let jar = stored(session('aal1'))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    const doc = {
      get cookie() {
        return jar;
      },
      set cookie(v: string) {
        lines.push(v);
        const [pair] = v.split(';');
        const name = pair.slice(0, pair.indexOf('='));
        jar = [...jar.split('; ').filter((p) => p && !p.startsWith(name + '=')), pair].join('; ');
      },
    };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { document: doc, location: { origin: 'https://sellonbay.com', href: 'https://sellonbay.com/login/mfa' } });
    const sb = createBrowserClient(SUPA, 'anon', { cookieOptions: opts, isSingleton: false, global: { fetch: a.fetch }, auth: { autoRefreshToken: false } });
    const { data: ch } = await sb.auth.mfa.challenge({ factorId: 'f1' });
    const { error } = await sb.auth.mfa.verify({ factorId: 'f1', challengeId: ch!.id, code: '123456' });
    expect(error).toBeNull();
    const written = lines.filter((l) => l.startsWith(KEY));
    expect(written.length).toBeGreaterThan(0);
    for (const l of written) for (const flag of [/;\s*Secure/i, /;\s*SameSite=Lax/i, /;\s*Path=\//i]) expect(l).toMatch(flag);
    const { data: level } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(level?.currentLevel).toBe('aal2');
  });

  it('sign-out: every session cookie is removed with the same path and flags it was set with', async () => {
    const a = auth();
    const s = server(stored(session('aal2')), a.fetch);
    const { error } = await s.sb.auth.signOut();
    expect(error).toBeNull();
    expect(a.calls.some((c) => c.path === '/logout')).toBe(true);
    const removed = s.written.filter((c) => c.name.startsWith(KEY));
    expect(removed.length).toBeGreaterThan(0);
    for (const c of removed) expect(c).toMatchObject({ value: '', options: { maxAge: 0, path: '/', secure: true, sameSite: 'lax' } });
  });
});
