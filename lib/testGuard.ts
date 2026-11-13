import { PRODUCTION_HOSTS, PRODUCTION_SUPABASE_REF } from './stage';

/*
 * Production database guard for automated tests (owner, 2026-11-13: a browser-test run wrote rows to the live database because the "demo"
 * server had the production keys from .env.local, and demo mode is rightly ignored with production keys). Pure, tested, safe in the proxy.
 *
 * Two server-side rules, checked in proxy.ts before anything else:
 *  1. A request marked as a test (header `x-sob-e2e`, sent by every Playwright request) is refused with 403 by a server whose database is
 *     the production project. Tests can never reach production data, whatever keys were loaded.
 *  2. A server started with LAUNCHBAY_DEMO=1 (the demo test server) that is configured for the production database answers 503 to every
 *     request that is not for a production address, instead of quietly running as a real site on the live database.
 * The live site never sends the test header, and requests for sellonbay.com are untouched by rule 2, so production behaviour is unchanged.
 */
export const TEST_HEADER = 'x-sob-e2e';
export const GUARD_HEADER = 'x-sob-guard';

type Env = Record<string, string | undefined>;
const productionDb = (env: Env) => (env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PRODUCTION_SUPABASE_REF);
const productionHost = (host: string | null) => PRODUCTION_HOSTS.includes((host ?? '').split(':')[0].toLowerCase());

export type Refusal = { status: 403 | 503; reason: string };

export function testGuard(env: Env, host: string | null, testHeader: string | null): Refusal | null {
  if (!productionDb(env)) return null;
  if (testHeader) return { status: 403, reason: 'Automated tests are refused here: this server uses the production database.' };
  if (env.LAUNCHBAY_DEMO === '1' && !productionHost(host))
    return { status: 503, reason: 'LAUNCHBAY_DEMO=1 with the production database: a demo/test server must not run on live data. Use fake or staging keys.' };
  return null;
}
