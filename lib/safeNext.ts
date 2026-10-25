/*
 * Where to go after signing in: only a path on this site. "//evil.com" and "/\evil.com" (browsers read the backslash as a slash) leave the site,
 * so a value is kept only when it resolves to our own origin. Anything else gives the fallback.
 */
export function safeNext(n: unknown, fallback = ''): string {
  if (typeof n !== 'string' || !n.startsWith('/') || n.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(n)) return fallback;
  try {
    const base = 'https://sellonbay.invalid';
    const u = new URL(n, base);
    return u.origin === base ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
