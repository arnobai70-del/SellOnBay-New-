import { describe, expect, it } from 'vitest';
import { MAX_LIFT, demoLift, demoQuality } from '@/lib/demoQuality';
import { generateLicenseKey, signToken, verifyToken } from '@/lib/delivery/token';

const base = { desc: 'x'.repeat(130), inc: ['a', 'b', 'c', 'd'] as string[] };
const shots3 = ['/a.png', '/b.png', '/c.png'];

describe('demo quality score', () => {
  it('a bare listing scores low, a well shown one scores high', () => {
    const bare = demoQuality({ desc: 'Short.', inc: ['a'] });
    const rich = demoQuality({ ...base, demo: { type: 'url', src: 'https://video.example.com/x' }, sample: 'https://example.com/s', trial: true, shots: shots3 });
    expect(bare).toBeLessThan(0.15);
    expect(rich).toBe(1);
  });

  it('a demo link counts only if it is https, a hosted upload counts, about:blank does not', () => {
    const q = (demo: { type: 'upload' | 'url'; src: string } | undefined) => demoQuality({ ...base, demo });
    expect(q({ type: 'url', src: 'https://v.example.com' })).toBeGreaterThan(q(undefined));
    expect(q({ type: 'url', src: 'http://v.example.com' })).toBe(q(undefined));
    expect(q({ type: 'url', src: 'about:blank' })).toBe(q(undefined));
    expect(q({ type: 'upload', src: '/demo/x/' })).toBeGreaterThan(q(undefined));
  });

  it('each extra signal raises the score', () => {
    const plain = demoQuality(base);
    expect(demoQuality({ ...base, sample: 'https://example.com/s' })).toBeGreaterThan(plain);
    expect(demoQuality({ ...base, trial: true })).toBeGreaterThan(plain);
    expect(demoQuality({ ...base, shots: shots3 })).toBeGreaterThan(demoQuality({ ...base, shots: ['/a.png'] }));
  });

  it('the lift is small: at most 0.4, so great reviews still win', () => {
    const best = demoLift({ ...base, demo: { type: 'url', src: 'https://v.example.com' }, sample: 'https://e.com/s', trial: true, shots: shots3 });
    expect(best).toBeCloseTo(MAX_LIFT, 5);
    expect(MAX_LIFT).toBeLessThanOrEqual(0.4);
    // a 4.0 listing with the best demo (4.4) does not pass a 4.5 listing with no demo at all
    expect(4.0 + best).toBeLessThan(4.5 + demoLift({ desc: '', inc: [] }));
  });
});

describe('trial links use the same signed links', () => {
  it('a trial link carries the product, the person and a short life', () => {
    const t = signToken('secret', { o: 'product-id', u: 'user-1', k: 'trial' }, 3600, 1_800_000_000_000);
    const v = verifyToken('secret', t, 1_800_000_000_000 + 1000);
    expect(v.ok && v.claims.k).toBe('trial');
    expect(verifyToken('secret', t, 1_800_000_000_000 + 3601_000)).toEqual({ ok: false, error: 'expired' });
  });
  it('licence keys still unique', () => expect(generateLicenseKey()).not.toBe(generateLicenseKey()));
});
