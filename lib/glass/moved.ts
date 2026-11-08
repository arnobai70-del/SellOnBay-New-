/*
 * Every public address that moved in the glass redesign, with a permanent redirect so rankings carry over (owner, 2026-11-07). Pure, tested, and small enough for
 * the proxy. Category and product addresses under /templates are rebuilt from their parts, so a renamed category ending still lands on the page that handles it.
 */
const EXACT: Record<string, string> = {
  '/browse': '/websites',
  '/login': '/signin',
  '/login/mfa': '/two-factor',
  '/forgot-password': '/signin?mode=forgot',
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
/* The old admin tools (owner, 2026-11-09): each one moved under its area of the glass admin. Longest first. */
const ADMIN: [string, string][] = [
  ['analytics/countries', 'visitors/countries'],
  ['analytics/report', 'visitors/report'],
  ['payments-review', 'orders/payments'],
  ['site/history', 'content/site/history'],
  ['cms/preview', 'content/cms/preview'],
  ['maintenance', 'settings/maintenance/modules'],
  ['promotions', 'marketing/promotions'],
  ['analytics', 'visitors/details'],
  ['revisions', 'orders/revisions'],
  ['disputes', 'support/disputes'],
  ['listings', 'listings/all'],
  ['releases', 'orders/releases'],
  ['requests', 'orders/requests'],
  ['security', 'security/blocks'],
  ['settings', 'settings/platform'],
  ['versions', 'listings/versions'],
  ['payouts', 'finance/payouts'],
  ['reports', 'reports/sales'],
  ['sellers', 'users/sellers'],
  ['support', 'support/tickets'],
  ['launch', 'settings/launch'],
  ['system', 'system/details'],
  ['orders', 'orders'],
  ['abuse', 'support/abuse'],
  ['audit', 'security/audit'],
  ['files', 'listings/files'],
  ['flags', 'settings/flags'],
  ['legal', 'settings/legal'],
  ['users', 'users/accounts'],
  ['beta', 'orders/beta'],
  ['repo', 'listings/repo'],
  ['risk', 'security/risk'],
  ['site', 'content/site'],
  ['cms', 'content/cms'],
  ['seo', 'seo'],
];
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

export function movedTo(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (EXACT[path]) return EXACT[path];
  const parts = path.split('/').filter(Boolean);
  if (!parts.every((p) => SEGMENT.test(p))) return null;
  if (parts[0] === 'dashboard' && parts[1] === 'admin') {
    const rest = parts.slice(2).join('/');
    if (!rest) return '/admin';
    const hit = ADMIN.find(([from]) => rest === from || rest.startsWith(from + '/'));
    return hit ? '/admin/' + hit[1] + rest.slice(hit[0].length) : '/admin';
  }
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
