/*
 * A visitor browsing the public store: home, shelves, a product page, the categories page and a domain search. Read only: it never
 * signs in, buys, posts or uploads, so it changes no data. Run with k6 (https://k6.io) against STAGING only:
 *
 *   BASE_URL=https://staging.example.com LOAD_CONFIRM=STAGING_ONLY PROFILE=load k6 run load/browse.js
 *
 * PROFILE is smoke, load, stress, spike or soak (load/lib/target.js). PRODUCT=<slug> picks a live listing for the product page.
 * See docs/LOAD_TESTING.md for what to watch and how to read the result.
 */
import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { THRESHOLDS, checkTarget, profileOf } from './lib/target.js';

const target = checkTarget(__ENV.BASE_URL, __ENV.LOAD_CONFIRM);
const profile = profileOf(__ENV.PROFILE || 'smoke');
if (!target.ok) throw new Error(target.reason);
if (!profile) throw new Error('PROFILE must be smoke, load, stress, spike or soak');

const BASE = target.base;
const PRODUCT = __ENV.PRODUCT || 'saffron-table';
const limited = new Counter('rate_limited'); // 429s are counted on their own: they mean our limits worked, not that the site broke

export const options = { ...profile, thresholds: THRESHOLDS, summaryTrendStats: ['avg', 'p(50)', 'p(90)', 'p(95)', 'p(99)', 'max'] };

function get(path, kind) {
  const res = http.get(`${BASE}${path}`, { tags: { kind, name: path.split('?')[0] }, redirects: 3 });
  if (res.status === 429) limited.add(1);
  check(res, { [`${path.split('?')[0]} answers 200`]: (r) => r.status === 200 || r.status === 429 });
  return res;
}

export function setup() {
  const res = http.get(`${BASE}/api/health`);
  if (res.status !== 200) fail(`Health check answered ${res.status}: is the staging site up?`);
}

export default function visitor() {
  group('home', () => get('/', 'page'));
  sleep(1 + Math.random() * 2);
  group('shelf', () => get(Math.random() < 0.6 ? '/browse' : '/apps/android', 'page'));
  sleep(1 + Math.random() * 3);
  group('product', () => get(`/product/${PRODUCT}`, 'page'));
  sleep(2 + Math.random() * 3);
  if (Math.random() < 0.3) group('categories', () => get('/categories', 'page'));
  if (Math.random() < 0.2) group('domain search', () => get(`/api/domains?name=shop${Math.floor(Math.random() * 1000)}`, 'api'));
  group('health', () => get('/api/health', 'api'));
  sleep(1 + Math.random() * 2);
}
