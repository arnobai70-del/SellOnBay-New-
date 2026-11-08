/*
 * Request timing for Server health (owner, 2026-11-08). Pure, tested. Only the route's shape, the method, the status class and the milliseconds are
 * kept: never a body, a query string, a header, an address or a user. Ids in the path become [id]. Samples live in memory for one hour per server copy.
 */
export type Sample = { at: number; route: string; method: string; status: string; ms: number };
export const KEEP_MS = 3_600_000;
export const MAX_SAMPLES = 5_000;

const ID = /^(?:[0-9a-f]{8}-[0-9a-f-]{27}|[0-9]+|[A-Za-z0-9_-]{20,}|[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{4,}|[0-9a-f]{32,})$/i;
const WORD = /^[a-z][a-z-]{0,30}$/;

/* "/api/orders/4d2c.../deliver?x=1" -> "/api/orders/[id]/deliver". Anything that is not a short plain word is treated as an id. */
export function routeOf(url: string): string {
  const path = url.split(/[?#]/)[0] || '/';
  return (
    '/' +
    path
      .split('/')
      .filter(Boolean)
      .slice(0, 8)
      .map((s) => (WORD.test(s) && !ID.test(s) ? s : '[id]'))
      .join('/')
  );
}

export const statusClass = (code: number) => `${Math.floor(code / 100)}xx`;

/* Every n-th request is kept (n from REQUEST_TIMING_SAMPLE, default 2 = every second request; 0 turns timing off). */
export function sampleEvery(env: Record<string, string | undefined>): number {
  const n = Number(env.REQUEST_TIMING_SAMPLE ?? '2');
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : 2;
}

/* p95 by nearest rank, of the samples in the last hour; null when there are fewer than 20, which is too few to say. */
export function p95(samples: readonly Sample[], now: number): { p95: number | null; count: number } {
  const ms = samples
    .filter((s) => now - s.at <= KEEP_MS)
    .map((s) => s.ms)
    .sort((a, b) => a - b);
  if (ms.length < 20) return { p95: null, count: ms.length };
  return { p95: ms[Math.min(ms.length - 1, Math.ceil(0.95 * ms.length) - 1)], count: ms.length };
}

export function keep(list: Sample[], s: Sample): void {
  list.push(s);
  while (list.length > MAX_SAMPLES || (list.length && s.at - list[0].at > KEEP_MS)) list.shift();
}
