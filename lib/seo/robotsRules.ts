/*
 * What robots.txt says. The private and working parts of the site are always kept out of crawlers (BASE_DISALLOW) and cannot be removed here.
 * An admin can add more paths to keep crawlers out of (saved by lib/seo/robotsStore.ts). Pure, so it is tested.
 * Not for removing pages from Google: a blocked page cannot be crawled, so Google never sees its noindex. Use the page's own noindex or archive switch for that.
 */
export const BASE_DISALLOW = ['/dashboard', '/messages', '/checkout', '/sell/new', '/auth', '/login', '/orders', '/pay', '/account', '/notifications', '/api/'];
export const ROBOTS_EXTRA_MAX = 30;

/* A path to keep crawlers out of: starts with /, plain characters, and not the whole site or a page that must stay crawlable. */
export function robotsPathProblem(p: string): string | null {
  if (!/^\/[A-Za-z0-9/_\-.~%*]{0,150}$/.test(p)) return 'Use a path like /private-area/ (letters, numbers, dashes and slashes).';
  if (p === '/' || p === '/*') return 'That would keep crawlers out of the whole site.';
  if (/^\/(sitemap\.xml|robots\.txt|_next|blog|templates|product|welcome|browse)(\/|$)/.test(p)) return 'Crawlers must be able to read that part of the site (pages, sitemap and the files they need).';
  return null;
}

export function cleanRobotsExtra(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) if (typeof x === 'string' && !robotsPathProblem(x.trim()) && !BASE_DISALLOW.includes(x.trim()) && !out.includes(x.trim())) out.push(x.trim());
  return out.slice(0, ROBOTS_EXTRA_MAX);
}

export const robotsDisallow = (extra: string[]) => [...BASE_DISALLOW, ...extra];
