import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRedisFetchForTests, sharedLock } from '@/lib/rateLimit';

/* A stand-in for Upstash: SET NX and the compare-and-delete release, on one map that two copies of the site would share. */
function fakeRedis(opts: { down?: boolean } = {}) {
  const store = new Map<string, string>();
  const f = (async (_url: string, init: RequestInit) => {
    if (opts.down) throw new Error('timeout');
    const cmds = JSON.parse(String(init.body)) as (string | number)[][];
    const out = cmds.map((c) => {
      if (c[0] === 'SET') {
        if (store.has(String(c[1]))) return { result: null };
        store.set(String(c[1]), String(c[2]));
        return { result: 'OK' };
      }
      if (c[0] === 'EVAL') {
        const [, , , key, value] = c.map(String);
        if (store.get(key) !== value) return { result: 0 };
        store.delete(key);
        return { result: 1 };
      }
      return { error: `unexpected ${c[0]}` };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, store };
}

describe('shared lock', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example-redis.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setRedisFetchForTests(null);
  });

  it('lets one holder in at a time and frees the lock on release', async () => {
    const r = fakeRedis();
    setRedisFetchForTests(r.f);
    const first = await sharedLock('buy:u1');
    expect(r.store.size).toBe(1);
    expect([...r.store.keys()][0]).toMatch(/^sob:lock:[A-Za-z0-9_-]{32}$/); // the buyer id never leaves the server
    let secondIn = false;
    const second = sharedLock('buy:u1').then((rel) => ((secondIn = true), rel));
    await new Promise((res) => setTimeout(res, 120));
    expect(secondIn).toBe(false);
    await first();
    const rel2 = await second;
    expect(secondIn).toBe(true);
    await rel2();
    expect(r.store.size).toBe(0);
  });

  it('gives up waiting after waitMs and lets the caller go ahead', async () => {
    const r = fakeRedis();
    setRedisFetchForTests(r.f);
    await sharedLock('buy:u2');
    const t = Date.now();
    const late = await sharedLock('buy:u2', 10_000, 200);
    expect(Date.now() - t).toBeLessThan(1_000);
    await late(); // a no-op: it must not free the other holder's lock
    expect(r.store.size).toBe(1);
  });

  it('never stops a purchase when Redis is down or not set up', async () => {
    setRedisFetchForTests(fakeRedis({ down: true }).f);
    await expect((await sharedLock('buy:u3'))()).resolves.toBeUndefined();
    vi.unstubAllEnvs();
    await expect((await sharedLock('buy:u3'))()).resolves.toBeUndefined();
  });
});
