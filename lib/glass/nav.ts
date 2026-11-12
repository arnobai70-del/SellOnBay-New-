/*
 * The menus of the glass UI, as plain data so a test can check them. Addresses are the ones in SELLONBAY_REDESIGN.md; a page that has not moved yet is built
 * in its phase, and nothing here is on the live site until then.
 */
export type NavLink = { label: string; href: string };
export type FooterColumn = { title: string; links: NavLink[] };

export const PUBLIC_LINKS: NavLink[] = [
  { label: 'Websites', href: '/websites' },
  { label: 'Domains', href: '/domains' },
  { label: 'Sellers', href: '/sellers' },
  { label: 'Sell', href: '/sell' },
  { label: 'Affiliate', href: '/affiliates' }, // always shown (owner, 2026-11-12); the page says when the program opens
  { label: 'Help', href: '/help' },
];

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Marketplace',
    links: [
      { label: 'Websites', href: '/websites' },
      { label: 'Domains', href: '/domains' },
      { label: 'Sellers', href: '/sellers' },
      { label: 'Guides', href: '/guides' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { label: 'Sell on SellOnBay', href: '/sell' },
      { label: 'Affiliate program', href: '/affiliates' },
      { label: 'Seller agreement', href: '/legal/seller-agreement' },
      { label: 'Seller dashboard', href: '/dashboard/seller' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Help center', href: '/help' },
      { label: 'Buyer protection', href: '/buyer-protection' },
      { label: 'Contact us', href: '/help#contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', href: '/legal/terms' },
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Refund policy', href: '/legal/refunds' },
      { label: 'Licenses', href: '/legal/licenses' },
    ],
  },
];

export type GlassRole = 'buyer' | 'seller' | 'admin';
export type RoleMenuItem = NavLink & { key: string };
export type RoleMenu = {
  label: string;
  /* Where the role's overview is; the "view as" links for an admin go here. */
  home: string;
  groups: { name?: string; items: RoleMenuItem[] }[];
  /* The main action in the top bar. */
  cta: NavLink;
  notifications: string;
  /* The design file of the role's dashboard (design-reference/), and where the top bar's search goes. */
  file: string;
  search: { action: string; placeholder: string };
};

export const ROLE_MENUS: Record<GlassRole, RoleMenu> = {
  buyer: {
    label: 'Buyer',
    home: '/dashboard/buyer',
    cta: { label: 'Browse websites', href: '/websites' },
    notifications: '/dashboard/buyer/notifications',
    file: 'buyer',
    search: { action: '/dashboard/buyer/orders', placeholder: 'Search your orders, websites, domains…' },
    groups: [
      { items: [{ key: 'overview', label: 'Overview', href: '/dashboard/buyer' }] },
      {
        name: 'Shopping',
        items: [
          { key: 'orders', label: 'Orders & payments', href: '/dashboard/buyer/orders' },
          { key: 'websites', label: 'My websites', href: '/dashboard/buyer/websites' },
          { key: 'domains', label: 'Domains', href: '/dashboard/buyer/domains' },
          { key: 'subscription', label: 'Subscription', href: '/dashboard/buyer/subscription' }, // buyer subscriptions (owner, 2026-11-12)
          { key: 'affiliate', label: 'Affiliate', href: '/dashboard/buyer/affiliate' }, // affiliate program (owner, 2026-11-12)
        ],
      },
      {
        name: 'Help',
        items: [
          { key: 'support', label: 'Support & disputes', href: '/dashboard/buyer/support' },
          { key: 'notifications', label: 'Notifications', href: '/dashboard/buyer/notifications' },
        ],
      },
      { name: 'Account', items: [{ key: 'account', label: 'Account & security', href: '/dashboard/buyer/account' }] },
    ],
  },
  seller: {
    label: 'Seller',
    home: '/dashboard/seller',
    cta: { label: '+ Upload website', href: '/dashboard/seller/websites/new' },
    notifications: '/dashboard/seller/notifications',
    file: 'seller-dashboard',
    search: { action: '/dashboard/seller/websites', placeholder: 'Search your websites, orders, buyers…' },
    groups: [
      { items: [{ key: 'overview', label: 'Overview', href: '/dashboard/seller' }] },
      {
        name: 'Sell',
        items: [
          { key: 'websites', label: 'My websites', href: '/dashboard/seller/websites' },
          { key: 'orders', label: 'Orders & escrow', href: '/dashboard/seller/orders' },
          { key: 'customization', label: 'Customization', href: '/dashboard/seller/customization' },
        ],
      },
      { name: 'Money', items: [{ key: 'payouts', label: 'Earnings & payouts', href: '/dashboard/seller/payouts' }] },
      {
        name: 'Help',
        items: [
          { key: 'support', label: 'Disputes & messages', href: '/dashboard/seller/support' },
          { key: 'notifications', label: 'Notifications', href: '/dashboard/seller/notifications' },
        ],
      },
      {
        name: 'Grow',
        items: [
          { key: 'store', label: 'Store & analytics', href: '/dashboard/seller/store' },
          { key: 'affiliate', label: 'Affiliate', href: '/dashboard/buyer/affiliate' }, // the same affiliate dashboard for sellers (owner, 2026-11-12)
        ],
      },
      { name: 'Account', items: [{ key: 'account', label: 'Account & security', href: '/dashboard/seller/account' }] },
    ],
  },
  admin: {
    label: 'Admin',
    home: '/admin',
    cta: { label: '+ Manual order', href: '/admin/orders#pos' },
    notifications: '/notifications',
    file: 'admin',
    search: { action: '/admin/search', placeholder: 'Search orders, users, listings…' },
    groups: [
      { items: [{ key: 'overview', label: 'Overview', href: '/admin' }] },
      {
        name: 'Operations',
        items: [
          { key: 'orders', label: 'Orders & payments', href: '/admin/orders' },
          { key: 'listings', label: 'Listing review', href: '/admin/listings' },
          { key: 'support', label: 'Disputes & support', href: '/admin/support' },
          { key: 'domains', label: 'Domains', href: '/admin/domains' },
        ],
      },
      {
        name: 'Money',
        items: [
          { key: 'finance', label: 'Finance & payouts', href: '/admin/finance' },
          { key: 'reports', label: 'Reports', href: '/admin/reports' },
          { key: 'subscriptions', label: 'Subscription Management', href: '/admin/subscriptions' }, // buyer and seller subscriptions (owner, 2026-11-12)
          { key: 'affiliates', label: 'Affiliate Management', href: '/admin/affiliates' }, // affiliate program (owner, 2026-11-12)
        ],
      },
      { name: 'People', items: [{ key: 'users', label: 'Users & roles', href: '/admin/users' }] },
      { name: 'Growth', items: [{ key: 'marketing', label: 'Marketing', href: '/admin/marketing' }] },
      {
        name: 'Content',
        items: [
          { key: 'guides', label: 'Guides', href: '/admin/content/guides' },
          { key: 'pages', label: 'Pages', href: '/admin/content/pages' },
        ],
      },
      {
        name: 'System',
        items: [
          { key: 'visitors', label: 'Visitors', href: '/admin/visitors' },
          { key: 'system', label: 'Server health', href: '/admin/system' },
          { key: 'security', label: 'Security & logs', href: '/admin/security' },
          { key: 'settings', label: 'Settings', href: '/admin/settings' },
        ],
      },
    ],
  },
};
