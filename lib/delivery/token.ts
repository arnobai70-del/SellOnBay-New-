import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/*
 * Expiring download links. A link is "<payload>.<signature>": the payload says which order, which person and when it stops working,
 * and the signature (HMAC-SHA256) stops anyone from changing it. The server still re-checks the order every time the link is used.
 * Pure functions, so they are easy to test.
 */
export type DeliveryClaims = { o: string; u: string | null; k: 'real' | 'demo' | 'trial'; exp: number; n: string };
export type TokenError = 'invalid' | 'expired';

export const TTL_SECONDS = 24 * 60 * 60;

const b64 = (b: Buffer) => b.toString('base64url');
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest();

export function signToken(secret: string, claims: { o: string; u: string | null; k: 'real' | 'demo' | 'trial' }, ttlSeconds = TTL_SECONDS, nowMs = Date.now()): string {
  const full: DeliveryClaims = { ...claims, exp: Math.floor(nowMs / 1000) + ttlSeconds, n: randomBytes(6).toString('hex') };
  const payload = b64(Buffer.from(JSON.stringify(full)));
  return `${payload}.${b64(mac(secret, payload))}`;
}

export function verifyToken(secret: string, token: string, nowMs = Date.now()): { ok: true; claims: DeliveryClaims } | { ok: false; error: TokenError } {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return { ok: false, error: 'invalid' };
  const want = mac(secret, payload);
  let got: Buffer;
  try {
    got = Buffer.from(sig, 'base64url');
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, error: 'invalid' };
  let claims: DeliveryClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (typeof claims.o !== 'string' || typeof claims.exp !== 'number' || (claims.k !== 'real' && claims.k !== 'demo' && claims.k !== 'trial')) return { ok: false, error: 'invalid' };
  if (Math.floor(nowMs / 1000) >= claims.exp) return { ok: false, error: 'expired' };
  return { ok: true, claims };
}

/* Licence key: 4 groups of 4 from an alphabet without look-alike characters (no 0, O, 1, I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateLicenseKey(): string {
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return 'LB-' + (chars.match(/.{4}/g) as string[]).join('-');
}
