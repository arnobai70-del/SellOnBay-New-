import { PRODUCTION_HOSTS, PRODUCTION_SUPABASE_REF } from './stage';

/*
 * LAUNCHBAY_DEMO=1 runs the site as the demo prototype: no database, no sign-in, orders in memory, the demo admin, no bot check. Handy for
 * local design checks and the demo browser tests, and dangerous on the live server, where one stray variable would switch sign-in off.
 * So it is ignored whenever the server is configured for production: the production Supabase project or the production address.
 */
export function demoMode(env: Record<string, string | undefined> = process.env): boolean {
  if (env.LAUNCHBAY_DEMO !== '1') return false;
  if ((env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(PRODUCTION_SUPABASE_REF)) return false;
  try {
    if (PRODUCTION_HOSTS.includes(new URL(env.NEXT_PUBLIC_SITE_URL ?? '').hostname.toLowerCase())) return false;
  } catch {
    /* no address set: not the live configuration */
  }
  return true;
}
