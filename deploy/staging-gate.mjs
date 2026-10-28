/*
 * Staging gate: the one door between the Cloudflare tunnel and the staging app (deploy/cloudflare-access-staging.md).
 *
 * The app's own staging password lives in proxy.ts, whose matcher skips static files, images and /demo, so on a public hostname those would
 * be open. This gate asks for the same password on EVERY path (static files, images, demos, error pages, APIs), locks out an address after
 * repeated wrong passwords, sends plain http to https, and marks every answer noindex. The app keeps its own checks behind it.
 *
 * Run (staging only): GATE_PORT=3010 APP_PORT=3012 node deploy/staging-gate.mjs, with SITE_STAGE=staging and STAGING_BASIC_AUTH set.
 * Both ports listen on 127.0.0.1 only; the tunnel reaches the gate, nothing reaches the app directly.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const ROBOTS = 'noindex, nofollow, noarchive';
const PRODUCTION_REF = 'knvxtgzrylvkhyrcezlq';

/* Why this environment may not run the gate, or null. */
export function gateProblem(env) {
  if (env.SITE_STAGE !== 'staging') return 'SITE_STAGE must be "staging".';
  const [user, pass] = (env.STAGING_BASIC_AUTH ?? '').split(/:(.*)/s);
  if (!user || !pass || pass.length < 20) return 'STAGING_BASIC_AUTH must be "user:password" with a password of at least 20 characters.';
  if ([/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pass)).length < 3) return 'The staging password needs at least three kinds of character.';
  if ((env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PRODUCTION_REF)) return 'This points at the PRODUCTION Supabase project.';
  if ((env.NEXT_PUBLIC_GA_ID ?? '') !== 'off') return 'NEXT_PUBLIC_GA_ID must be "off" on staging.';
  let site;
  try {
    site = new URL(env.NEXT_PUBLIC_SITE_URL ?? '');
  } catch {
    return 'NEXT_PUBLIC_SITE_URL must be the https staging address.';
  }
  if (site.protocol !== 'https:' || ['sellonbay.com', 'www.sellonbay.com'].includes(site.hostname)) return 'NEXT_PUBLIC_SITE_URL must be the https staging address, never production.';
  return null;
}

const digest = (s) => createHash('sha256').update(s).digest();
/* Is this Authorization header the staging password? Compared in constant time. */
export function basicOk(header, expected) {
  if (typeof header !== 'string' || !header.startsWith('Basic ')) return false;
  let given = '';
  try {
    given = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }
  return timingSafeEqual(digest(given), digest(expected));
}

/* The lock-out key for an address. An IPv6 visitor usually holds a whole /64, so the key is that /64, or rotating addresses would dodge the lock. */
export function addressKey(ip) {
  const a = String(ip ?? '')
    .trim()
    .toLowerCase()
    .replace(/^::ffff:(?=\d+\.)/, '');
  if (!a.includes(':')) return a || 'unknown';
  const [head, tail = ''] = a.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = a.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return (
    full
      .slice(0, 4)
      .map((x) => x.replace(/^0+(?=.)/, ''))
      .join(':') + '::/64'
  );
}

/* Wrong passwords per address: `max` in `windowMs` locks the address out for `lockMs`. The table never grows past `maxKeys`. */
export function createLimiter({ max = 10, windowMs = 15 * 60_000, lockMs = 15 * 60_000, maxKeys = 10_000 } = {}) {
  const seen = new Map();
  return {
    locked(key, now = Date.now()) {
      const e = seen.get(key);
      return e && e.until > now ? Math.ceil((e.until - now) / 1000) : 0;
    },
    fail(key, now = Date.now()) {
      if (seen.size >= maxKeys) for (const [k, e] of seen) if (e.until <= now && now - e.first > windowMs) seen.delete(k);
      // Still full (many addresses at once): drop the oldest entries that are not locked out, so memory stays bounded.
      if (seen.size >= maxKeys) for (const [k, e] of seen) if (seen.size >= maxKeys && e.until <= now) seen.delete(k);
      const e = seen.get(key);
      const next = !e || now - e.first > windowMs ? { first: now, count: 1, until: 0 } : { ...e, count: e.count + 1 };
      if (next.count >= max) next.until = now + lockMs;
      seen.set(key, next);
    },
    ok(key) {
      seen.delete(key);
    },
  };
}

/* Plain http through the tunnel goes to https before any password is asked for (so it is never sent unencrypted). The address is the
   fixed staging origin, never the request's Host header (which a client can set). */
export function httpsRedirect(proto, origin, url) {
  if (proto !== 'http') return null;
  return `${origin}${url.startsWith('/') ? url : '/'}`;
}

/* Headers for the app. The visitor can write X-Forwarded-For, X-Forwarded-Host and Host themselves (Cloudflare keeps them), and the app's
   rate limits and redirects read them, so the gate overwrites them with what it knows: the address Cloudflare saw and the fixed staging origin. */
export function forwardHeaders(headers, origin, ip) {
  const host = new URL(origin).host;
  const out = { ...headers };
  for (const k of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip']) delete out[k];
  return { ...out, host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https', 'x-forwarded-for': ip, 'x-real-ip': ip, 'cf-connecting-ip': ip };
}

/* Staging is reached over https only, so every cookie the app sets is marked Secure (the Supabase session cookies are not by default). */
export const secureCookie = (c) => (/;\s*secure(;|$)/i.test(c) ? c : `${c}; Secure`);

const base = { 'x-robots-tag': ROBOTS, 'cache-control': 'no-store', 'strict-transport-security': 'max-age=63072000; includeSubDomains' };

export function startGate(env = process.env) {
  const problem = gateProblem(env);
  if (problem) throw new Error(`Staging gate refused to start: ${problem}`);
  const expected = env.STAGING_BASIC_AUTH;
  const appPort = Number(env.APP_PORT ?? 3012);
  const gatePort = Number(env.GATE_PORT ?? 3010);
  const limiter = createLimiter();
  const origin = new URL(env.NEXT_PUBLIC_SITE_URL).origin;
  const server = http.createServer((req, res) => {
    // Cloudflare sets CF-Connecting-IP itself (a visitor's own value is replaced), and only the tunnel reaches this loopback port.
    const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? 'unknown').slice(0, 64);
    const key = addressKey(ip);
    const to = httpsRedirect(req.headers['x-forwarded-proto'], origin, req.url ?? '/');
    if (to) {
      res.writeHead(req.method === 'GET' || req.method === 'HEAD' ? 308 : 403, { ...base, location: to });
      return res.end();
    }
    const wait = limiter.locked(key);
    if (wait) {
      res.writeHead(429, { ...base, 'retry-after': String(wait), 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Too many wrong passwords. Try again later.');
    }
    if (!basicOk(req.headers.authorization, expected)) {
      if (req.headers.authorization) limiter.fail(key);
      res.writeHead(401, { ...base, 'www-authenticate': 'Basic realm="SellOnBay staging", charset="UTF-8"', 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Sign in to the SellOnBay staging site.');
    }
    limiter.ok(key);
    const up = http.request({ host: '127.0.0.1', port: appPort, method: req.method, path: req.url, headers: forwardHeaders(req.headers, origin, ip) }, (r) => {
      const cookies = r.headers['set-cookie'];
      res.writeHead(r.statusCode ?? 502, { ...r.headers, ...base, ...(cookies ? { 'set-cookie': cookies.map(secureCookie) } : {}) });
      r.pipe(res);
    });
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { ...base, 'content-type': 'text/plain; charset=utf-8' });
      res.end('The staging app is not running.');
    });
    req.pipe(up);
  });
  server.on('upgrade', (_req, socket) => socket.destroy()); // no websockets on staging
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;
  server.listen(gatePort, '127.0.0.1');
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = startGate();
  s.on('listening', () => console.log(`staging gate on 127.0.0.1:${process.env.GATE_PORT ?? 3010} -> 127.0.0.1:${process.env.APP_PORT ?? 3012}`));
}
