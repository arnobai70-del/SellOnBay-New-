/*
 * The gtag function for direct GA4 (owner decision D-G: keep G-FEK9C0CM04, no GTM).
 * gtag.js only acts on dataLayer entries that are a function's `arguments` object, exactly as Google's own snippet pushes them. A plain array
 * (for example from `(...args) => dataLayer.push(args)`) is ignored, so every command would be lost. Kept separate so a test can check the shape.
 */
type GaWindow = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

/*
 * What Google may see of a page's address. GA runs from the root layout, so it also sees signed-in pages, and a signed-out order can be opened by its id alone.
 * On a private page: no query string, and any part of the path that is not a plain word becomes [id]. A hash is never sent anywhere (a sign-in link can carry
 * its token there). Public pages keep their query string, as before. New private areas go in this list.
 */
const PRIVATE_AREAS = [
  '/account',
  '/admin',
  '/cart',
  '/checkout',
  '/dashboard',
  '/forgot-password',
  '/login',
  '/messages',
  '/notifications',
  '/orders',
  '/pay',
  '/reset-password',
  '/sell/new',
  '/signin',
  '/two-factor',
  '/verify-email',
];
/* Everything after the area's name is an id here, whatever it looks like. */
const ID_AREAS = ['/messages', '/orders', '/pay'];
const under = (path: string, area: string) => path === area || path.startsWith(area + '/');
const WORD = /^[a-z][a-z-]{0,39}$/;

export function gaPage(pathname: string, search = ''): { path: string; title: string | null } {
  const clean = pathname.split(/[?#]/)[0];
  if (!PRIVATE_AREAS.some((a) => under(clean, a))) return { path: clean + (search ? (search.startsWith('?') ? search : '?' + search) : ''), title: null };
  const idArea = ID_AREAS.find((a) => under(clean, a));
  const safe = idArea ? idArea + clean.slice(idArea.length).replace(/\/[^/]+/g, '/[id]') : clean.replace(/\/[^/]+/g, (part) => (WORD.test(part.slice(1)) ? part : '/[id]'));
  return { path: safe, title: safe }; // the title of a private page can name an order or a person, so the cleaned address stands in for it
}

/* The page the visitor came from: a cleaned address if it was on this site. Another site's address is left as the browser gave it. */
export function gaReferrer(referrer: string, origin: string): string {
  if (!referrer) return '';
  try {
    const u = new URL(referrer);
    return u.origin === origin ? origin + gaPage(u.pathname, u.search).path : referrer;
  } catch {
    return '';
  }
}

export function installGtag(w: GaWindow): (...args: unknown[]) => void {
  w.dataLayer = w.dataLayer || [];
  const layer = w.dataLayer;
  // A classic function, not an arrow: only it has its own `arguments`.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  return w.gtag;
}
