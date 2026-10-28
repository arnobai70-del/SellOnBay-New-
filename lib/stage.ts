/*
 * Staging protection (SellOnBay 2.0 staging, Blueprint 14.1: "staging fully noindex and disallowed"). Pure, tested, safe in the proxy.
 * SITE_STAGE=staging (server environment) turns on, for every response: X-Robots-Tag noindex, a robots.txt that disallows everything, an empty
 * sitemap, page metadata noindex, and HTTP Basic sign-in with STAGING_BASIC_AUTH ("user:password"). Without SITE_STAGE nothing changes, so
 * production SEO stays exactly as it is.
 * It fails closed: a staging server with no password, or one that points at the production Supabase project or the production address,
 * answers 503 to everything instead of running.
 */
export const PRODUCTION_SUPABASE_REF = 'knvxtgzrylvkhyrcezlq';
export const STAGING_SUPABASE_REF = 'occketfmjwciilzuddkv';
export const PRODUCTION_HOSTS = ['sellonbay.com', 'www.sellonbay.com'];
export const STAGING_ROBOTS = 'noindex, nofollow, noarchive';

type Env = Record<string, string | undefined>;
export const isStaging = (env: Env = process.env) => env.SITE_STAGE === 'staging';

/* What is wrong with a staging server's configuration, or null. Only asked when SITE_STAGE=staging. */
export function stagingProblem(env: Env = process.env): string | null {
  const auth = env.STAGING_BASIC_AUTH ?? '';
  if (!/^[^:\s]{3,64}:\S{12,200}$/.test(auth)) return 'STAGING_BASIC_AUTH must be "user:password" with a password of at least 12 characters.';
  const supa = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (supa.includes(PRODUCTION_SUPABASE_REF)) return 'This staging server points at the PRODUCTION Supabase project.';
  if (supa && !supa.includes(STAGING_SUPABASE_REF)) return `NEXT_PUBLIC_SUPABASE_URL must be the staging project (${STAGING_SUPABASE_REF}).`;
  let host = '';
  try {
    host = new URL(env.NEXT_PUBLIC_SITE_URL ?? '').hostname.toLowerCase();
  } catch {
    return 'NEXT_PUBLIC_SITE_URL must be the staging address.';
  }
  if (PRODUCTION_HOSTS.includes(host)) return 'NEXT_PUBLIC_SITE_URL is the production address.';
  if ((env.NEXT_PUBLIC_GA_ID ?? '') !== 'off') return 'NEXT_PUBLIC_GA_ID must be "off" on staging, so test visits never reach the production GA4 property.';
  return null;
}

/* Constant-time comparison without node:crypto (the proxy may run on the edge). */
function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* Does the Authorization header carry the staging user and password? */
export function basicAuthOk(header: string | null, expected: string): boolean {
  if (!header || !/^Basic\s+/i.test(header)) return false;
  let given = '';
  try {
    // UTF-8, like browsers send and the staging gate reads (atob alone gives Latin-1, so a non-ASCII password would never match).
    given = new TextDecoder().decode(Uint8Array.from(atob(header.replace(/^Basic\s+/i, '').trim()), (c) => c.charCodeAt(0)));
  } catch {
    return false;
  }
  return same(given, expected);
}

/*
 * Paths a staging server answers without the password: the health check (so the host can see it is up) and the scheduled jobs, which have
 * their own secret (the cron secret, checked in the cron routes). Nothing else.
 */
export const openOnStaging = (path: string) => path === '/api/health' || path.startsWith('/api/cron/');
