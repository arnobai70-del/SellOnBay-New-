import 'server-only';

/*
 * Cloudflare Turnstile check. Set TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY for real use.
 * Without them the official Cloudflare TEST keys are used, which pass for everyone: fine for development, NOT a bot check.
 * Before launch, set the real keys (see docs/DECISIONS.md).
 */
export const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET = '1x0000000000000000000000000000000AA';
// The official test keys (1x/2x/3x followed by zeroes) must not count
// as bot protection even when somebody copies them into production .env.
const TEST_KEY_PREFIX = /^[123]x0{10,}/;
export function hasNonTestTurnstileKeys(
  site = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  secret = process.env.TURNSTILE_SECRET_KEY ?? '',
): boolean {
  const a = site.trim();
  const b = secret.trim();
  return !!a && !!b && !TEST_KEY_PREFIX.test(a) && !TEST_KEY_PREFIX.test(b);
}
export const usingTestKeys = () => !hasNonTestTurnstileKeys();

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const liveKeys = hasNonTestTurnstileKeys();
  // Production must never pass verification using Cloudflare's universal test keys.
  // A deliberately configured demo prototype is exempt so it stays explorable.
  if (process.env.NODE_ENV === 'production' && process.env.LAUNCHBAY_DEMO !== '1' && !liveKeys) return false;
  const body = new URLSearchParams({ secret: liveKeys ? process.env.TURNSTILE_SECRET_KEY! : TEST_SECRET, response: token });
  if (ip && ip !== 'unknown') body.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { success?: boolean };
    return !!j.success;
  } catch {
    return false; // if we cannot check, we do not let it through
  }
}

/* The real site key for the browser, read at request time (so keys set on the host after a build still work), or '' while only test keys exist. */
export const liveSiteKey = () => (hasNonTestTurnstileKeys() ? (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim() : '');

/*
 * The bot check on sign in, sign up and password reset. It runs only once real keys are set: unlike the question form, these pages must keep
 * working on a host where the owner has not added Turnstile yet (the launch check lists the missing keys). The rate limits in lib/guard.ts apply either way.
 */
export async function authBotCheck(token: string | undefined, ip: string): Promise<boolean> {
  if (!hasNonTestTurnstileKeys()) return true;
  return verifyTurnstile(token, ip);
}
