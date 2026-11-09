import { AdminShell } from './glass/AdminShell';
import { DashboardShell } from './glass/DashboardShell';

export type Role = 'buyer' | 'seller' | 'admin';

/*
 * The older tool pages (moved under /admin and the buyer and seller areas, owner 2026-11-09) keep their props, and are drawn in the design's
 * dashboard (components/glass/DashboardShell.tsx): the menu item of the area each tool belongs to is the one shown as current.
 */
const AREA: Record<string, string> = {
  'admin-beta': 'orders',
  'admin-requests': 'orders',
  'admin-releases': 'orders',
  'admin-revisions': 'orders',
  'admin-payments-review': 'orders',
  'admin-listings': 'listings',
  'admin-files': 'listings',
  'admin-repo': 'listings',
  'admin-versions': 'listings',
  'admin-disputes': 'support',
  'admin-support': 'support',
  'admin-abuse': 'support',
  'admin-payouts': 'finance',
  'admin-reports': 'reports',
  'admin-users': 'users',
  'admin-sellers': 'users',
  'admin-promotions': 'marketing',
  'admin-security': 'security',
  'admin-audit': 'security',
  'admin-risk': 'security',
  'admin-settings': 'settings',
  'admin-flags': 'settings',
  'admin-launch': 'settings',
  'admin-legal': 'settings',
  'admin-maintenance': 'settings',
  'admin-seo': 'settings',
  'admin-cms': 'pages',
  'admin-site': 'pages',
  'admin-site-history': 'pages',
  'admin-analytics': 'visitors',
  'admin-countries': 'visitors',
  'admin-system': 'system',
  'buyer-requests': 'orders',
  'seller-revisions': 'orders',
  'seller-reports': 'store',
  'seller-promote': 'store',
};

export async function DashShell({
  role,
  active,
  title,
  children,
  name,
  signedIn = false,
  viewerRole,
}: {
  role: Role;
  active: string;
  title: string;
  children: React.ReactNode;
  name?: string;
  signedIn?: boolean;
  viewerRole?: Role;
  badges?: Record<string, number>;
}) {
  const area = AREA[active] ?? (active === 'messages' ? 'support' : 'overview');
  if (role === 'admin')
    return (
      <AdminShell viewer={signedIn ? { id: '', name: name ?? 'Admin', role: 'admin' } : null} active={area} file="admin-settings" title={title}>
        {children}
      </AdminShell>
    );
  return (
    <DashboardShell role={role} file={role === 'buyer' ? 'buyer-orders' : 'seller-orders'} active={area} title={title} name={name} signedIn={signedIn} viewerRole={viewerRole}>
      {children}
    </DashboardShell>
  );
}
