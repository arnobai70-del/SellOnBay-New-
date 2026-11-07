/*
 * Every public address that moved in the glass redesign, with a permanent redirect so rankings carry over (owner, 2026-11-07). Pure, tested, and small enough for
 * the proxy. Category and product addresses under /templates are rebuilt from their parts, so a renamed category ending still lands on the page that handles it.
 */
const EXACT: Record<string, string> = {
  '/browse': '/websites',
  '/blog': '/guides',
  '/faq': '/help',
  '/how-it-works': '/buyer-protection',
  '/terms': '/legal/terms',
  '/privacy': '/legal/privacy',
  '/refunds': '/legal/refunds',
  '/seller-agreement': '/legal/seller-agreement',
  '/acceptable-use': '/legal/acceptable-use',
  '/dmca': '/legal/dmca',
};
/* The old /websites/<category> pages. Anything else under /websites is a product. */
const OLD_CATEGORY_PAGES = ['ecommerce', 'saas', 'business', 'portfolio', 'industry', 'stores', 'landing-pages', 'portfolios', 'restaurants', 'tools', 'health', 'real-estate'];
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

export function movedTo(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (EXACT[path]) return EXACT[path];
  const parts = path.split('/').filter(Boolean);
  if (!parts.every((p) => SEGMENT.test(p))) return null;
  if (parts[0] === 'templates') {
    if (parts.length === 1) return '/websites';
    if (parts.length === 2) return `/websites/category/${parts[1]}`;
    if (parts.length === 3) return `/websites/${parts[2]}`;
  }
  if (parts[0] === 'product' && parts.length === 2) return `/websites/${parts[1]}`;
  if (parts[0] === 'websites' && parts.length === 2 && OLD_CATEGORY_PAGES.includes(parts[1])) return `/websites/category/${parts[1]}`;
  // The blog's pictures and feed keep their addresses, so pictures in existing posts still load.
  if (parts[0] === 'blog' && parts.length === 2 && parts[1] !== 'feed.xml' && parts[1] !== 'media') return `/guides/${parts[1]}`;
  return null;
}
