import { STAGING_SUPABASE_REF } from '../../lib/stage';

/*
 * The keys for the specs that write to a real database (REAL_URL). Taken ONLY from the process environment, which the staging run fills from
 * outside the repository (~/.sob-staging). `.env.local` is never read here: it holds the production keys (owner, 2026-11-13: browser tests
 * never touch the production database). Any project other than staging is ignored, so those specs skip themselves instead of throwing while
 * the test list loads (the VS Code Playwright extension lists tests without a staging environment).
 */
const fromEnv: Record<string, string> = {};
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) if (process.env[k]) fromEnv[k] = process.env[k] as string;
export const realEnv: Record<string, string> = (fromEnv.NEXT_PUBLIC_SUPABASE_URL ?? '').includes(STAGING_SUPABASE_REF) ? fromEnv : {};

/* For contexts a spec opens itself: the test header (lib/testGuard.ts) and the staging password (lib/stage.ts), sent only when asked. */
const [user, pass] = (process.env.STAGING_BASIC_AUTH ?? '').split(':');
export const realContext = {
  extraHTTPHeaders: { 'x-sob-e2e': '1' }, // lib/testGuard.ts: a production-database server refuses it
  ...(user && pass ? { httpCredentials: { username: user, password: pass, send: 'unauthorized' as const } } : {}),
};
