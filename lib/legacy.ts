/*
 * The public site is the five-category template marketplace: the home page (E-commerce Templates), four category pages and the product pages in
 * them. Everything else that used to be public (shelves, developers, domains, blog, tools, the old home) is "legacy": its code and data stay in the
 * repository and the database, but visitors get "410 Gone" and it is out of the menu, the sitemap and the search. Set NEXT_PUBLIC_LEGACY_PUBLIC=1
 * (at build time) on a test server to keep the old public site, which is how the older browser tests run. Safe to import in the browser.
 */
export const legacyPublic = () => process.env.NEXT_PUBLIC_LEGACY_PUBLIC === '1';

/* Public addresses that are retired: the address itself and everything below it. Working routes (account, checkout, orders, admin, legal) are never here. */
export const RETIRED_PAGES = ['/browse', '/apps', '/categories', '/developers', '/domains', '/find', '/blog', '/tools', '/welcome', '/explore', '/websites', '/guest'];
export const RETIRED_API = ['/api/domains', '/api/tools', '/api/developers', '/api/hire'];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');

/* Is this address retired (a page or a public API of the old site)? */
export function isRetired(path: string): boolean {
  return RETIRED_PAGES.some((p) => under(path, p)) || RETIRED_API.some((p) => under(path, p));
}
export const isRetiredApi = (path: string) => RETIRED_API.some((p) => under(path, p));
