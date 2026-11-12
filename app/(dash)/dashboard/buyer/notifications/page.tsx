import type { Metadata } from 'next';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { NotificationsList, GROUPS, type Group } from '@/components/glass/NotificationsList';
import { notificationsFor } from '@/lib/notify';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export const dynamic = 'force-dynamic';

const SHOWN: Group[] = ['all', 'orders', 'websites', 'domains', 'support'];

/* design-reference/buyer-notifications.html: every notice for this buyer, by kind, with a way to what it is about. */
export default async function BuyerNotifications({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/buyer/notifications', roles: ['buyer', 'seller', 'admin'] });
  const raw = (await searchParams).type;
  const group: Group = SHOWN.includes(raw as Group) && Object.hasOwn(GROUPS, raw ?? '') ? (raw as Group) : 'all';
  const list = viewer ? await notificationsFor(viewer.id, 100) : [];
  return (
    <BuyerShell viewer={viewer} active="notifications" file="buyer-notifications" title={tx('Notifications')} head={false}>
      <NotificationsList
        list={list}
        group={group}
        groups={SHOWN}
        base="/dashboard/buyer/notifications"
        now={Date.now()}
        link={(n, g) => {
          const order = typeof n.payload.orderId === 'string' ? n.payload.orderId : null;
          if (g === 'domains') return ['/dashboard/buyer/domains', 'Open'];
          if (g === 'support') return ['/dashboard/buyer/support', 'Reply'];
          if (g === 'websites') return ['/dashboard/buyer/websites', 'Open'];
          return order ? [`/orders/${order}`, 'View'] : ['/dashboard/buyer/orders', 'View'];
        }}
      />
    </BuyerShell>
  );
}
