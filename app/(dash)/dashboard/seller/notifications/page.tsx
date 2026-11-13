import type { Metadata } from 'next';
import { NotificationsList, GROUPS, type Group } from '@/components/glass/NotificationsList';
import { SellerShell } from '@/components/glass/SellerShell';
import { sellerNotes } from '@/lib/glass/seller';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Notifications'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const SHOWN: Group[] = ['all', 'orders', 'websites', 'support', 'payouts'];

/* design-reference/seller-notifications.html: new orders, listing decisions, disputes and payout news, by kind. */
export default async function SellerNotifications({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/notifications', roles: ['seller', 'admin'] });
  const raw = (await searchParams).type;
  const group: Group = SHOWN.includes(raw as Group) && Object.hasOwn(GROUPS, raw ?? '') ? (raw as Group) : 'all';
  const list = viewer ? await sellerNotes(viewer.id) : [];
  return (
    <SellerShell viewer={viewer} active="notifications" file="seller-notifications" title={tx('Notifications')} head={false}>
      <NotificationsList
        list={list}
        group={group}
        groups={SHOWN}
        labels={{ orders: 'Sales', websites: 'Listings', support: 'Disputes' }}
        base="/dashboard/seller/notifications"
        now={Date.now()}
        link={(n, g) => {
          const order = typeof n.payload.orderId === 'string' ? n.payload.orderId : null;
          if (g === 'payouts') return ['/dashboard/seller/payouts', 'View'];
          if (g === 'support') return ['/dashboard/seller/support', 'Reply'];
          if (g === 'websites') return ['/dashboard/seller/websites', 'Open'];
          return order ? [`/orders/${order}`, 'View'] : ['/dashboard/seller/orders', 'View'];
        }}
      />
    </SellerShell>
  );
}
