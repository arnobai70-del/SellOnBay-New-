/*
 * A browser that writes to our API from another site (or from a sandboxed seller demo, whose origin is "null") is refused, whatever cookies it
 * carries. Session cookies are SameSite=Lax, which already stops most of this; this check does not depend on the browser getting that right.
 * Requests with no Origin header (payment webhooks, the cron caller, curl) are not from a browser page and pass; they have their own secrets.
 * Server Actions are checked by Next itself and are not under /api.
 */
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const hostOf = (v: string | null | undefined): string | null => {
  if (!v) return null;
  try {
    return new URL(v.includes('://') ? v : `https://${v}`).host.toLowerCase().replace(/^www\./, ''); // www and the bare domain are one site
  } catch {
    return null;
  }
};

/** True when the request must be refused: an unsafe method on /api from a page on a different host. `hosts` are the names we answer to. */
export function crossSiteWrite(method: string, path: string, origin: string | null, hosts: (string | null | undefined)[]): boolean {
  if (SAFE.has(method.toUpperCase()) || !path.startsWith('/api/')) return false;
  if (origin === null) return false;
  const from = origin === 'null' ? null : hostOf(origin);
  if (!from) return true;
  return !hosts.some((h) => hostOf(h?.split(',')[0]?.trim()) === from);
}
