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
};

export const ROLE_MENUS: Record<GlassRole, RoleMenu> = {
  buyer: {
    label: 'Buyer',
    home: '/dashboard/buyer',
    cta: { label: 'Browse websites', href: '/websites' },
    notifications: '/dashboard/buyer/notifications',
    groups: [
      { items: [{ key: 'overview', label: 'Overview', href: '/dashboard/buyer' }] },
      {
        name: 'Shopping',
        items: [
          { key: 'orders', label: 'Orders & payments', href: '/dashboard/buyer/orders' },
          { key: 'websites', label: 'My websites', href: '/dashboard/buyer/websites' },
          { key: 'domains', label: 'Domains', href: '/dashboard/buyer/domains' },
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
      { name: 'Grow', items: [{ key: 'store', label: 'Store & analytics', href: '/dashboard/seller/store' }] },
      { name: 'Account', items: [{ key: 'account', label: 'Account & security', href: '/dashboard/seller/account' }] },
    ],
  },
  admin: {
    label: 'Admin',
    home: '/admin',
    cta: { label: '+ Manual order', href: '/admin/orders#pos' },
    notifications: '/notifications',
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
        ],
      },
      { name: 'People', items: [{ key: 'users', label: 'Users & roles', href: '/admin/users' }] },
      { name: 'Growth', items: [{ key: 'marketing', label: 'Marketing', href: '/admin/marketing' }] },
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
