import { TEST_HEADER } from '../../lib/testGuard';

/*
 * Runs once before any browser test (playwright.config.ts globalSetup). Owner, 2026-11-13: browser tests never run against the production
 * database. Every target server is asked, with the test header, for /api/health. A server that uses the production database refuses that
 * request (403, lib/testGuard.ts), and a demo server started with production keys answers 503: either one stops the whole run here, before
 * a single test can write anything. A server that is not running is fine (its tests fail on their own, writing nothing).
 */
export const E2E_HEADERS = { [TEST_HEADER]: '1' };

export default async function preflight() {
  const targets = {
    DEMO_URL: process.env.DEMO_URL ?? 'http://localhost:3002',
    NEW_URL: process.env.NEW_URL ?? 'http://localhost:3005',
    REAL_URL: process.env.REAL_URL ?? 'http://localhost:3000',
  };
  const [user, pass] = (process.env.STAGING_BASIC_AUTH ?? '').split(':');
  const auth: Record<string, string> = user && pass ? { authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64') } : {};
  for (const [name, base] of Object.entries(targets)) {
    let res: Response;
    try {
      res = await fetch(new URL('/api/health', base), { headers: { ...E2E_HEADERS, ...auth }, signal: AbortSignal.timeout(10_000) });
    } catch {
      continue; // not running
    }
    if (res.headers.get('x-sob-guard') || res.status === 503)
      throw new Error(`${name} (${base}) uses the PRODUCTION database. Browser tests never run against production: restart it with fake or staging keys.`);
  }
}
