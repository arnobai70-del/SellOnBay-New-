import 'server-only';
import { createHash } from 'node:crypto';
import { allow } from './delivery/service';

/*
 * Rate limits that every copy of the site shares. With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set, the count lives in Upstash Redis,
 * so two or more copies behind a load balancer see the same numbers. Without them, or when Redis does not answer within REDIS_TIMEOUT_MS, the
 * count falls back to this server's memory (allow() in lib/delivery/service.ts), exactly as before: Redis being down never closes the site.
 * Keys are hashed before they leave the server, so no address or account id is stored at Upstash.
 * The window slides: the count is this window's hits plus the share of the last window that still overlaps it (the usual two-counter method).
 */
const REDIS_TIMEOUT_MS = 300;
const url = () => (process.env.UPSTASH_REDIS_REST_URL ?? '').replace(/\/+$/, '');
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
export const sharedLimitsConfigured = () => /^https:\/\//.test(url()) && token().length > 0;

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/* Tests swap in a stand-in Redis. */
export function setRedisFetchForTests(f: Fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a));
}

const g = globalThis as { __redisDownLogged?: number };
function logDown(e: unknown) {
  const now = Date.now();
  if (g.__redisDownLogged && now - g.__redisDownLogged < 60_000) return;
  g.__redisDownLogged = now;
  console.warn('Shared rate limits: Redis did not answer, counting in memory for now.', e instanceof Error ? e.message : e);
}

async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetcher(`${url()}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Redis answered ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const bad = out.find((r) => r.error);
  if (bad) throw new Error(bad.error);
  return out.map((r) => r.result);
}

/* True when the action may go ahead, and counts it; false when key has had max hits in the last windowMs. */
export async function limit(key: string, max: number, windowMs: number, nowMs = Date.now()): Promise<boolean> {
  if (!sharedLimitsConfigured()) return allow(key, max, windowMs, nowMs);
  const id = createHash('sha256').update(key).digest('base64url').slice(0, 32);
  const slot = Math.floor(nowMs / windowMs);
  const cur = `sob:rl:${id}:${slot}`;
  const prev = `sob:rl:${id}:${slot - 1}`;
  try {
    const [count, , before] = await pipeline([
      ['INCR', cur],
      ['PEXPIRE', cur, windowMs * 2],
      ['GET', prev],
    ]);
    const overlap = 1 - (nowMs % windowMs) / windowMs;
    if (Number(count) + Number(before ?? 0) * overlap <= max) return true;
    await pipeline([['DECR', cur]]).catch(() => undefined); // a refused try does not use up the allowance, the same as the memory counter
    return false;
  } catch (e) {
    logDown(e);
    return allow(key, max, windowMs, nowMs);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

/*
 * A short lock that every copy of the site shares, for work that must not run twice at the same moment (two Buy clicks landing on two copies).
 * Waits up to waitMs for a holder to finish; the lock frees itself after holdMs if its holder stops. Returns the release function.
 * Without Redis, or when Redis does not answer, or after waiting too long, it returns a release that does nothing and the caller goes ahead:
 * the in-process lock and the database checks behind it stay as before, so Redis being down never stops a purchase.
 */
export async function sharedLock(key: string, holdMs = 10_000, waitMs = 3_000): Promise<() => Promise<void>> {
  const none = async () => undefined;
  if (!sharedLimitsConfigured()) return none;
  const name = `sob:lock:${createHash('sha256').update(key).digest('base64url').slice(0, 32)}`;
  const mine = crypto.randomUUID();
  const until = Date.now() + waitMs;
  try {
    for (let pause = 50; ; pause = Math.min(pause * 2, 400)) {
      const [got] = await pipeline([['SET', name, mine, 'NX', 'PX', holdMs]]);
      if (got === 'OK') return async () => void (await pipeline([['EVAL', RELEASE, 1, name, mine]]).catch(() => undefined));
      if (Date.now() + pause > until) return none;
      await sleep(pause);
    }
  } catch (e) {
    logDown(e);
    return none;
  }
}
