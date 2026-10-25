import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limit, setRedisFetchForTests, sharedLimitsConfigured } from '@/lib/rateLimit';

/* A stand-in for Upstash's REST pipeline: INCR, PEXPIRE, GET and DECR on one shared map, as two copies of the site would see it. */
function fakeRedis() {
  const store = new Map<string, number>();
  const bodies: string[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const cmds = JSON.parse(String(init.body)) as (string | number)[][];
    const out = cmds.map(([cmd, key]) => {
      const k = String(key);
      if (cmd === 'INCR') store.set(k, (store.get(k) ?? 0) + 1);
      if (cmd === 'DECR') store.set(k, (store.get(k) ?? 0) - 1);
      if (cmd === 'GET') return { result: store.has(k) ? String(store.get(k)) : null };
      if (cmd === 'PEXPIRE') return { result: 1 };
      return { result: store.get(k) };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, bodies, store };
}

describe('shared rate limits', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example-redis.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setRedisFetchForTests(null);
  });

  it('counts in Redis when it is set up, and refuses after the limit without using up the allowance', async () => {
    const r = fakeRedis();
    setRedisFetchForTests(r.f);
    expect(sharedLimitsConfigured()).toBe(true);
    const now = 1_700_000_000_000;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await limit('chat:u1:buyer', 3, 60_000, now + i));
    expect(results).toEqual([true, true, true, false, false]);
    expect([...r.store.values()]).toEqual([3]); // the two refused tries were taken back
  });

  it('two copies of the site share one count', async () => {
    const r = fakeRedis();
    setRedisFetchForTests(r.f);
    const now = 1_700_000_100_000;
    // A copy's own memory would allow 2 each; Redis allows 2 in all.
    expect(await limit('order:u2', 2, 60_000, now)).toBe(true);
    expect(await limit('order:u2', 2, 60_000, now + 1)).toBe(true);
    expect(await limit('order:u2', 2, 60_000, now + 2)).toBe(false);
  });

  it('the last window still counts in part, so the limit slides', async () => {
    const r = fakeRedis();
    setRedisFetchForTests(r.f);
    const w = 60_000;
    const start = Math.floor(1_700_000_200_000 / w) * w;
    for (let i = 0; i < 4; i++) expect(await limit('slide', 4, w, start + i)).toBe(true);
    expect(await limit('slide', 4, w, start + w + 1)).toBe(false); // just after the window turned: almost all of the last one still counts
    expect(await limit('slide', 4, w, start + w + w * 0.8)).toBe(true); // most of it has slid out
  });

  it('never sends an address or account id to Redis', async () => {
    const r = fakeRedis();
    setRedisFetchForTests(r.f);
    await limit('dl-ip:203.0.113.9', 5, 60_000);
    expect(r.bodies.join(' ')).not.toContain('203.0.113.9');
    expect(r.bodies.join(' ')).toMatch(/sob:rl:/);
  });

  it('when Redis fails, counts on this server instead of closing the site', async () => {
    setRedisFetchForTests((async () => {
      throw new Error('down');
    }) as unknown as typeof fetch);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const now = 1_700_000_300_000;
    expect(await limit('fallback:a', 1, 60_000, now)).toBe(true);
    expect(await limit('fallback:a', 1, 60_000, now + 1)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('without the two settings it is the memory limiter, as before', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(sharedLimitsConfigured()).toBe(false);
    const called = vi.fn();
    setRedisFetchForTests(called as unknown as typeof fetch);
    expect(await limit('mem:x', 1, 60_000)).toBe(true);
    expect(await limit('mem:x', 1, 60_000)).toBe(false);
    expect(called).not.toHaveBeenCalled();
  });
});
