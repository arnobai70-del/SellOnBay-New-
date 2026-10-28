import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module without types
import { addressKey, basicOk, createLimiter, forwardHeaders, gateProblem, httpsRedirect, secureCookie, startGate } from '../../deploy/staging-gate.mjs';
import { basicAuthOk } from '@/lib/stage';
import { clientAddress } from '@/lib/clientIp';

const PASS = 'Gate-Test-Password-0123456789';
const AUTH = 'Basic ' + Buffer.from(`qa:${PASS}`).toString('base64');
const env = {
  SITE_STAGE: 'staging',
  STAGING_BASIC_AUTH: `qa:${PASS}`,
  NEXT_PUBLIC_GA_ID: 'off',
  NEXT_PUBLIC_SUPABASE_URL: 'https://occketfmjwciilzuddkv.supabase.co',
  NEXT_PUBLIC_SITE_URL: 'https://staging.sellonbay.com',
};

describe('staging gate rules', () => {
  it('runs only on staging, with a strong password, never against production or with GA4 on', () => {
    expect(gateProblem(env)).toBeNull();
    expect(gateProblem({ ...env, SITE_STAGE: '' })).toMatch(/SITE_STAGE/);
    expect(gateProblem({ ...env, STAGING_BASIC_AUTH: 'qa:short' })).toMatch(/20 characters/);
    expect(gateProblem({ ...env, STAGING_BASIC_AUTH: 'qa:' + 'a'.repeat(30) })).toMatch(/three kinds/);
    expect(gateProblem({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://knvxtgzrylvkhyrcezlq.supabase.co' })).toMatch(/PRODUCTION/);
    expect(gateProblem({ ...env, NEXT_PUBLIC_GA_ID: 'G-123' })).toMatch(/GA_ID/);
    expect(gateProblem({ ...env, NEXT_PUBLIC_SITE_URL: 'http://staging.sellonbay.com' })).toMatch(/https/);
    expect(gateProblem({ ...env, NEXT_PUBLIC_SITE_URL: 'https://sellonbay.com' })).toMatch(/never production/);
  });
  it('accepts exactly the password', () => {
    expect(basicOk(AUTH, `qa:${PASS}`)).toBe(true);
    expect(basicOk('Basic ' + Buffer.from(`qa:${PASS}x`).toString('base64'), `qa:${PASS}`)).toBe(false);
    expect(basicOk('Bearer x', `qa:${PASS}`)).toBe(false);
    expect(basicOk(undefined, `qa:${PASS}`)).toBe(false);
  });
  it('locks an address out after 10 wrong passwords for 15 minutes; others are not affected', () => {
    const l = createLimiter();
    for (let i = 0; i < 10; i++) l.fail('a', 1000);
    expect(l.locked('a', 2000)).toBeGreaterThan(800);
    expect(l.locked('b', 2000)).toBe(0);
    expect(l.locked('a', 1000 + 15 * 60_000 + 1)).toBe(0);
  });
  it('marks every cookie Secure', () => {
    expect(secureCookie('sb-x=1; Path=/; SameSite=Lax')).toBe('sb-x=1; Path=/; SameSite=Lax; Secure');
    expect(secureCookie('lb_dev=1; Secure; HttpOnly')).toBe('lb_dev=1; Secure; HttpOnly');
  });
  it('locks out a whole IPv6 /64, so rotating addresses inside it does not help', () => {
    expect(addressKey('2001:db8:aa:bb:1::7')).toBe('2001:db8:aa:bb::/64');
    expect(addressKey('2001:0db8:00aa:00bb:ffff:1:2:3')).toBe('2001:db8:aa:bb::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(addressKey('203.0.113.9')).toBe('203.0.113.9');
    const l = createLimiter();
    for (let i = 0; i < 10; i++) l.fail(addressKey(`2001:db8:aa:bb::${i + 1}`), 1000);
    expect(l.locked(addressKey('2001:db8:aa:bb:9:9:9:9'), 2000)).toBeGreaterThan(0);
  });
  it('the lock-out table stays bounded and keeps the addresses that are locked', () => {
    const l = createLimiter({ max: 2, maxKeys: 50 });
    l.fail('locked', 0);
    l.fail('locked', 0);
    for (let i = 0; i < 1000; i++) l.fail(`x${i}`, 10);
    expect(l.locked('locked', 20)).toBeGreaterThan(0);
  });
  it('overwrites the forwarding headers a visitor can write, so the app sees the real address and host', () => {
    const h = forwardHeaders(
      { 'x-forwarded-for': '1.2.3.4', 'x-forwarded-host': 'evil.example', host: 'evil.example', 'x-real-ip': '1.2.3.4', forwarded: 'for=1.2.3.4', cookie: 'a=1' },
      'https://staging.sellonbay.com',
      '203.0.113.5',
    );
    expect(h).toMatchObject({
      host: 'staging.sellonbay.com',
      'x-forwarded-host': 'staging.sellonbay.com',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '203.0.113.5',
      'x-real-ip': '203.0.113.5',
      cookie: 'a=1',
    });
    expect(h.forwarded).toBeUndefined();
    // The app's rate limits (default settings) now key on the address Cloudflare saw.
    expect(clientAddress(new Headers(h), {})).toBe('203.0.113.5');
  });
  it('the app accepts the same UTF-8 password as the gate', () => {
    const pass = 'qa:Pässwörd-Ünïcode-0123456789';
    const header = 'Basic ' + Buffer.from(pass, 'utf8').toString('base64');
    expect(basicOk(header, pass)).toBe(true);
    expect(basicAuthOk(header, pass)).toBe(true);
    expect(basicAuthOk('Basic ' + Buffer.from(`qa:${PASS}`).toString('base64'), `qa:${PASS}`)).toBe(true);
  });
  it('sends plain http to https first', () => {
    expect(httpsRedirect('http', 'https://staging.sellonbay.com', '/x?y=1')).toBe('https://staging.sellonbay.com/x?y=1');
    expect(httpsRedirect('https', 'https://staging.sellonbay.com', '/')).toBeNull();
  });
});

describe('staging gate in front of a stand-in app', () => {
  let app: http.Server;
  let gate: http.Server;
  const GATE = 3931;
  beforeAll(async () => {
    app = http
      .createServer((req, res) => {
        res.setHeader('set-cookie', ['sb-test=1; Path=/; SameSite=Lax']);
        if (req.url === '/echo-headers') return res.end(JSON.stringify(req.headers));
        res.end('app:' + req.url);
      })
      .listen(3932, '127.0.0.1');
    gate = startGate({ ...env, GATE_PORT: String(GATE), APP_PORT: '3932' });
    await new Promise((r) => gate.on('listening', r));
  });
  afterAll(() => {
    gate.close();
    app.close();
  });
  const get = (path: string, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${GATE}${path}`, { headers, redirect: 'manual' });

  it('every path needs the password: pages, APIs, static files, images, demos, health, cron, unknown paths', async () => {
    for (const p of ['/', '/api/health', '/api/cron/orders', '/_next/static/chunks/main.js', '/_next/image?url=%2Fa.png&w=64&q=75', '/favicon.ico', '/logo.svg', '/demo/x/index.html', '/nope']) {
      const r = await get(p);
      expect(r.status, p).toBe(401);
      expect(r.headers.get('x-robots-tag'), p).toBe('noindex, nofollow, noarchive');
      expect(await r.text(), p).not.toContain('app:');
    }
    const ok = await get('/_next/static/chunks/main.js', { authorization: AUTH });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('app:/_next/static/chunks/main.js');
    expect(ok.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(ok.headers.get('set-cookie')).toContain('Secure');
  });
  it('plain http through the tunnel is sent to the fixed https address before any password, whatever Host says', async () => {
    const r = await get('/login', { 'x-forwarded-proto': 'http' });
    expect(r.status).toBe(308);
    expect(r.headers.get('location')).toBe('https://staging.sellonbay.com/login');
  });
  it('the app behind the gate never sees a forged address or host, and does see the password it checks again', async () => {
    const r = await get('/echo-headers', { authorization: AUTH, 'cf-connecting-ip': '203.0.113.90', 'x-forwarded-for': '6.6.6.6', 'x-forwarded-host': 'evil.example' });
    const seen = await r.json();
    expect(seen).toMatchObject({ 'x-forwarded-for': '203.0.113.90', 'x-forwarded-host': 'staging.sellonbay.com', host: 'staging.sellonbay.com', authorization: AUTH });
  });
  it('ten wrong passwords lock that address out, even for the right password', async () => {
    const ip = { 'cf-connecting-ip': '203.0.113.77' };
    for (let i = 0; i < 10; i++) expect((await get('/', { ...ip, authorization: 'Basic ' + Buffer.from('qa:wrong').toString('base64') })).status).toBe(401);
    const locked = await get('/', { ...ip, authorization: AUTH });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await get('/', { 'cf-connecting-ip': '203.0.113.78', authorization: AUTH })).status).toBe(200);
  });
});
