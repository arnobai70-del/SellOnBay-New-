import { describe, expect, it } from 'vitest';
import { decideRelease, isFunded, releaseConfigFromEnv } from '@/lib/delivery/policy';
import { isPrivateAddress } from '@/lib/delivery/ssrf';
import { generateLicenseKey, signToken, verifyToken } from '@/lib/delivery/token';

const SECRET = 'test-secret-value';
const NOW = 1_800_000_000_000;

describe('signed download links', () => {
  const claims = { o: '11111111-1111-4111-8111-111111111111', u: 'user-1', k: 'real' as const };

  it('accepts a fresh link', () => {
    const t = signToken(SECRET, claims, 60, NOW);
    const v = verifyToken(SECRET, t, NOW + 1000);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.claims.o).toBe(claims.o);
  });

  it('rejects an expired link', () => {
    const t = signToken(SECRET, claims, 60, NOW);
    expect(verifyToken(SECRET, t, NOW + 61_000)).toEqual({ ok: false, error: 'expired' });
  });

  it('a link made for 24 hours works at 23h59 and not at 24h', () => {
    const t = signToken(SECRET, claims, 24 * 3600, NOW);
    expect(verifyToken(SECRET, t, NOW + (24 * 3600 - 60) * 1000).ok).toBe(true);
    expect(verifyToken(SECRET, t, NOW + 24 * 3600 * 1000)).toEqual({ ok: false, error: 'expired' });
  });

  it('rejects a changed payload (someone edits the order or the expiry)', () => {
    const t = signToken(SECRET, claims, 60, NOW);
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), o: '22222222-2222-4222-8222-222222222222' })).toString('base64url');
    expect(verifyToken(SECRET, `${forged}.${sig}`, NOW)).toEqual({ ok: false, error: 'invalid' });
    const longer = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), exp: 9_999_999_999 })).toString('base64url');
    expect(verifyToken(SECRET, `${longer}.${sig}`, NOW)).toEqual({ ok: false, error: 'invalid' });
  });

  it('rejects a link signed with another secret, and garbage', () => {
    const t = signToken('another-secret', claims, 60, NOW);
    expect(verifyToken(SECRET, t, NOW)).toEqual({ ok: false, error: 'invalid' });
    for (const bad of ['', 'abc', 'a.b.c', '.', 'a.', '.b', 'not base64 !!.also not']) expect(verifyToken(SECRET, bad, NOW).ok).toBe(false);
  });

  it('every link is different, even for the same order', () => {
    expect(signToken(SECRET, claims, 60, NOW)).not.toBe(signToken(SECRET, claims, 60, NOW));
  });
});

describe('licence keys', () => {
  it('look like LB-XXXX-XXXX-XXXX-XXXX with no look-alike characters, and do not repeat', () => {
    const keys = new Set(Array.from({ length: 500 }, generateLicenseKey));
    expect(keys.size).toBe(500);
    for (const k of keys) expect(k).toMatch(/^LB(-[A-HJ-NP-Z2-9]{4}){4}$/);
  });
});

describe('when files may be released', () => {
  const off = releaseConfigFromEnv({});
  const base = { fundedAtMs: NOW, nowMs: NOW + 1000, priceCents: 5000 };

  it('nothing before the order is funded, or after a cancel or refund', () => {
    for (const status of ['awaiting_payment', 'cancelled', 'refunded']) {
      expect(isFunded(status)).toBe(false);
      expect(decideRelease({ ...base, status }, off)).toEqual({ allowed: false, reason: 'not_funded' });
    }
  });

  it('released as soon as the order is funded, not only after accept', () => {
    for (const status of ['funded', 'in_delivery', 'delivered', 'accepted', 'disputed']) expect(decideRelease({ ...base, status }, off)).toEqual({ allowed: true });
  });

  it('the release delay is off by default', () => {
    expect(off).toEqual({ delayMinutes: 0, newBuyerDays: 0, highPriceCents: 0 });
  });

  it('a delay on its own applies to everyone until it ends', () => {
    const cfg = { delayMinutes: 30, newBuyerDays: 0, highPriceCents: 0 };
    const d = decideRelease({ ...base, status: 'funded' }, cfg);
    expect(d).toEqual({ allowed: false, reason: 'delay', availableAtMs: NOW + 30 * 60_000 });
    expect(decideRelease({ ...base, status: 'funded', nowMs: NOW + 31 * 60_000 }, cfg)).toEqual({ allowed: true });
  });

  it('with a new-buyer rule, only new buyers wait', () => {
    const cfg = { delayMinutes: 60, newBuyerDays: 7, highPriceCents: 0 };
    const day = 86_400_000;
    expect(decideRelease({ ...base, status: 'funded', buyerCreatedAtMs: NOW - 2 * day }, cfg).allowed).toBe(false);
    expect(decideRelease({ ...base, status: 'funded', buyerCreatedAtMs: NOW - 30 * day }, cfg).allowed).toBe(true);
  });

  it('with a high-price rule, only big orders wait, and a flagged buyer always waits', () => {
    const cfg = { delayMinutes: 60, newBuyerDays: 0, highPriceCents: 10_000 };
    expect(decideRelease({ ...base, status: 'funded', priceCents: 20_000 }, cfg).allowed).toBe(false);
    expect(decideRelease({ ...base, status: 'funded', priceCents: 2_000 }, cfg).allowed).toBe(true);
    expect(decideRelease({ ...base, status: 'funded', priceCents: 2_000, buyerFlagged: true }, cfg).allowed).toBe(false);
  });

  it('reads the switches from the environment', () => {
    expect(releaseConfigFromEnv({ RELEASE_DELAY_MINUTES: '45', RELEASE_DELAY_NEW_BUYER_DAYS: '3', RELEASE_DELAY_HIGH_PRICE_CENTS: '9900' })).toEqual({
      delayMinutes: 45,
      newBuyerDays: 3,
      highPriceCents: 9900,
    });
    expect(releaseConfigFromEnv({ RELEASE_DELAY_MINUTES: 'banana' }).delayMinutes).toBe(0);
  });
});

describe('seller links never reach our own network', () => {
  it('refuses private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.4.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])
      expect(isPrivateAddress(ip), ip).toBe(true);
  });
  it('allows ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
