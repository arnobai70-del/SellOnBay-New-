/*
 * Address changes an admin saved (/dashboard/admin/seo/redirects): when a page or listing moves, the old address sends visitors and search
 * engines to the new one. Pure rules, so they are tested; the store is redirectStore.ts and proxy.ts reads them through redirectRead.ts.
 */
export type Redirect = { from: string; to: string; code: 301 | 302 };
export const REDIRECT_MAX = 500;

/* Addresses that are part of how the site works. They are never redirected, so a mistake here cannot lock anyone out or break a payment. */
export const REDIRECT_PROTECTED = [
  '/api',
  '/_next',
  '/dashboard',
  '/login',
  '/auth',
  '/checkout',
  '/pay',
  '/orders',
  '/account',
  '/messages',
  '/notifications',
  '/demo',
  '/admin',
  '/sell/new',
  '/reset-password',
  '/maintenance',
];

export const isProtectedPath = (path: string) => REDIRECT_PROTECTED.some((p) => path === p || path.startsWith(p + '/'));

export const normalizeFrom = (v: string) =>
  v
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '') || '/';

const okTo = (v: string) => /^\/[^\s<>"\\]*$/.test(v) || /^https:\/\/[^\s<>"\\]+$/.test(v);

export function redirectProblem(list: Redirect[], r: Redirect, liveOwn: string[] = []): string | null {
  const from = normalizeFrom(r.from);
  if (!/^\/[A-Za-z0-9/_\-.~%]{1,200}$/.test(from) || from === '/') return 'The old address must be a path like /old-page.';
  if (isProtectedPath(from)) return 'That address is part of how the site works and cannot be redirected.';
  if (liveOwn.includes(from)) return 'That address is a live page of the site. Unpublish or rename it first.';
  if (r.code !== 301 && r.code !== 302) return 'Pick 301 (moved for good) or 302 (moved for now).';
  if (!okTo(r.to) || r.to.length > 300) return 'The new address must be a path starting with / or an https address.';
  if (normalizeFrom(r.to) === from) return 'The old and new address are the same.';
  // A chain that comes back to the start would loop forever.
  const next = [...list.filter((x) => x.from !== from), { ...r, from }];
  let at = r.to;
  for (let i = 0; i < 10; i++) {
    const hop = next.find((x) => x.from === normalizeFrom(at));
    if (!hop) return null;
    if (hop.from === from) return 'That would make a loop of redirects.';
    at = hop.to;
  }
  return 'That chain of redirects is too long.';
}

export function cleanRedirects(raw: unknown): Redirect[] {
  if (!Array.isArray(raw)) return [];
  const out: Redirect[] = [];
  for (const x of raw.slice(0, REDIRECT_MAX)) {
    const o = (x && typeof x === 'object' ? x : {}) as Partial<Redirect>;
    if (typeof o.from !== 'string' || typeof o.to !== 'string') continue;
    const r: Redirect = { from: normalizeFrom(o.from), to: o.to.trim(), code: o.code === 302 ? 302 : 301 };
    if (!redirectProblem(out, r)) out.push(r);
  }
  return out;
}

/* Where an address should go, or null. One hop only: the saved rules are checked against loops when they are saved. */
export const redirectFor = (list: Redirect[], path: string): Redirect | null => list.find((r) => r.from === normalizeFrom(path)) ?? null;
