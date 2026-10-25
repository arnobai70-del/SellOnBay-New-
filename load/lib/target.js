/*
 * Where a load test may run. Load tests send thousands of requests, so they run against a staging copy only, never the live site.
 * Plain JavaScript with no k6 imports, so the same check runs under k6 and under node --test (load/target.test.mjs).
 */
export const LIVE_HOSTS = ['sellonbay.com', 'www.sellonbay.com'];

export function checkTarget(baseUrl, confirm, liveHosts = LIVE_HOSTS) {
  let url;
  try {
    url = new URL(String(baseUrl ?? '').trim());
  } catch {
    return { ok: false, reason: 'Set BASE_URL to the staging address, for example https://staging.example.com' };
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return { ok: false, reason: 'BASE_URL must be a plain http(s) address without a user or password' };
  const host = url.hostname.toLowerCase();
  if (liveHosts.some((h) => host === h || host.endsWith('.' + h)) && !host.startsWith('staging.'))
    return { ok: false, reason: `BASE_URL points at the live site (${host}). Load tests run against staging only.` };
  if (confirm !== 'STAGING_ONLY') return { ok: false, reason: 'Set LOAD_CONFIRM=STAGING_ONLY to confirm this address is a staging copy.' };
  return { ok: true, base: url.origin };
}

/* The shapes of a run. Numbers are virtual users (each one a visitor clicking around with pauses), not registered accounts. */
export const PROFILES = {
  smoke: {
    stages: [
      { duration: '30s', target: 2 },
      { duration: '10s', target: 0 },
    ],
  },
  load: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '10m', target: 50 },
      { duration: '2m', target: 0 },
    ],
  },
  stress: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 150 },
      { duration: '5m', target: 300 },
      { duration: '5m', target: 500 },
      { duration: '3m', target: 0 },
    ],
  },
  spike: {
    stages: [
      { duration: '1m', target: 20 },
      { duration: '20s', target: 400 },
      { duration: '2m', target: 400 },
      { duration: '20s', target: 20 },
      { duration: '2m', target: 20 },
      { duration: '30s', target: 0 },
    ],
  },
  soak: {
    stages: [
      { duration: '5m', target: 40 },
      { duration: '2h', target: 40 },
      { duration: '5m', target: 0 },
    ],
  },
};
export const profileOf = (name) => PROFILES[name] ?? null;

/* Pass marks. A run that misses them fails (k6 exits non-zero). They are starting targets to compare runs, not a promise of capacity. */
export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{kind:page}': ['p(95)<1500'],
  'http_req_duration{kind:api}': ['p(95)<500'],
  checks: ['rate>0.99'],
};
