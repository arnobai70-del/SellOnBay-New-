/*
 * The parts of SellOnBay that an admin can put into maintenance one at a time (owner, 2026-10-20). While one is closed, only its pages and
 * APIs stop; everything else keeps working. Which page and API belongs to which module is decided here and nowhere else, and a test checks
 * that every API route is either in a module or in ALWAYS_ON on purpose. Saved state: table module_maintenance (migration 0049).
 */
export const MODULES = {
  auth: {
    label: 'Authentication & registration',
    keeps: 'Signing in still works, so nobody is locked out (admins included), and people already signed in stay signed in. New accounts, password resets and account pages wait.',
  },
  visitor: { label: 'Visitor dashboard', keeps: 'Browsing, previews and demos.' },
  buyer: { label: 'Buyer dashboard', keeps: 'Browsing, orders, checkout and the seller side.' },
  seller: { label: 'Seller dashboard', keeps: 'Everything buyers and visitors use.' },
  admin: { label: 'Admin dashboard', keeps: 'The whole public site. Maintenance Manager and the audit log stay open, so this can always be undone.' },
  catalog: { label: 'Product catalog & search', keeps: 'Home, existing orders, dashboards and policy pages.' },
  upload: { label: 'Product upload & management', keeps: 'Existing products can still be browsed and bought.' },
  checkout: { label: 'Checkout & payment', keeps: 'Browsing, search and existing orders. Payments already started still finish (webhooks keep running).' },
  orders: { label: 'Orders & delivery', keeps: 'Browsing and checkout. Order timers (delivery deadline, 48-hour review) keep running.' },
  messaging: { label: 'Messaging & notifications', keeps: 'Orders, payments and browsing.' },
  seo: { label: 'SEO & CMS', keeps: 'The whole public site. Only the blog and SEO editing close.' },
  ai: { label: 'AI tools', keeps: 'Everything else.' },
  disputes: { label: 'Disputes & refunds', keeps: 'Orders, payments and browsing.' },
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];
export const isModuleKey = (k: string): k is ModuleKey => Object.hasOwn(MODULES, k);

/* Limits for what an admin saves. */
export const MAINTENANCE_LIMITS = { message: 300, defaultRetrySeconds: 300, maxRetrySeconds: 86_400 } as const;

/*
 * Never closed by any module: money already moving (payment webhooks, scheduled order and payout jobs), the health check, and the
 * Maintenance Manager with the audit log (the way back). Paths are API paths without the /api prefix.
 */
export const ALWAYS_ON_API: RegExp[] = [/^\/webhooks\//, /^\/paypal\/return$/, /^\/cron\//, /^\/health$/, /^\/admin\/maintenance(\/|$)/];
const ALWAYS_ON_PAGE: RegExp[] = [/^\/dashboard\/admin\/maintenance(\/|$)/, /^\/dashboard\/admin\/audit(\/|$)/, /^\/(login|auth)(\/|$)/, /^\/maintenance(\/|$)/];

/* API routes (path after /api), most specific first. */
const API_RULES: [RegExp, ModuleKey][] = [
  [/^\/admin\/(seo|posts)(\/|$)/, 'seo'],
  [/^\/admin\/disputes(\/|$)/, 'disputes'],
  [/^\/admin(\/|$)/, 'admin'],
  [/^\/account(\/|$)/, 'auth'],
  [/^\/(demo\/)?orders\/[^/]+\/(dispute|evidence)$/, 'disputes'],
  [/^\/disputes(\/|$)/, 'disputes'],
  [/^\/(demo\/)?orders\/[^/]+\/messages$/, 'messaging'],
  [/^\/demo\/orders\/[^/]+\/pay$/, 'checkout'],
  [/^\/demo\/orders$/, 'checkout'],
  [/^\/paypal\/start$/, 'checkout'],
  [/^\/(demo\/)?orders(\/|$)/, 'orders'],
  [/^\/download(\/|$)/, 'orders'],
  [/^\/(hire|products\/[^/]+\/trial)$/, 'checkout'],
  [/^\/(notifications|presale)(\/|$)/, 'messaging'],
  [/^\/listings(\/|$)/, 'upload'],
  [/^\/(seller|developers)(\/|$)/, 'seller'],
  [/^\/(domains|search)(\/|$)/, 'catalog'],
  [/^\/tools(\/|$)/, 'ai'],
  [/^\/track$/, 'visitor'], // visitor analytics: a closed module just stops counting
];

/* Pages, most specific first. Pages in no module (home, how it works, FAQ, policies, sell landing page) are always open. */
const PAGE_RULES: [RegExp, ModuleKey][] = [
  [/^\/dashboard\/admin\/seo(\/|$)/, 'seo'],
  [/^\/dashboard\/admin\/disputes(\/|$)/, 'disputes'],
  [/^\/dashboard\/admin(\/|$)/, 'admin'],
  [/^\/dashboard\/buyer(\/|$)/, 'buyer'],
  [/^\/dashboard\/seller(\/|$)/, 'seller'],
  [/^\/(reset-password|account)(\/|$)/, 'auth'], // sign-in pages stay open (ALWAYS_ON_PAGE); the sign-up and reset actions check for themselves
  [/^\/guest(\/|$)/, 'visitor'],
  [/^\/sell\/new(\/|$)/, 'upload'],
  [/^\/developers\/join(\/|$)/, 'seller'],
  [/^\/developers\/[^/]+\/hire(\/|$)/, 'checkout'],
  [/^\/(checkout|pay)(\/|$)/, 'checkout'],
  [/^\/orders(\/|$)/, 'orders'],
  [/^\/(messages|notifications)(\/|$)/, 'messaging'],
  [/^\/blog(\/|$)/, 'seo'],
  [/^\/(tools|find)(\/|$)/, 'ai'],
  [/^\/(browse|apps|product|preview|categories|websites|templates|developers|domains|search)(\/|$)/, 'catalog'],
];

const match = (rules: [RegExp, ModuleKey][], path: string) => rules.find(([re]) => re.test(path))?.[1] ?? null;

/* The module an API path belongs to ("/api/orders/x/accept" or "/orders/x/accept"), or null when it is always open. */
export function moduleOfApi(path: string): ModuleKey | null {
  const p = path.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  if (ALWAYS_ON_API.some((re) => re.test(p))) return null;
  return match(API_RULES, p);
}

/* The module a page path belongs to, or null when it is always open. */
export function moduleOfPage(path: string): ModuleKey | null {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (ALWAYS_ON_PAGE.some((re) => re.test(p))) return null;
  return match(PAGE_RULES, p);
}
