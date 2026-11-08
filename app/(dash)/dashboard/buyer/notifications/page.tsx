import type { Metadata } from 'next';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { MarkRead } from '@/components/MarkRead';
import { shortDate } from '@/lib/glass/orderStatus';
import { notificationsFor } from '@/lib/notify';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function BuyerNotifications() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/notifications', roles: ['buyer', 'seller'] });
  const list = viewer ? await notificationsFor(viewer.id, 100) : [];
  const unread = list.filter((n) => !n.read).length;
  return (
    <BuyerShell viewer={viewer} active="notifications" title="Notifications" subtitle={`${unread} unread`} actions={unread ? <MarkRead /> : undefined}>
      <GlassCard as="section">
        {list.length ? (
          list.map((n) => (
            <div key={n.id} className="li" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: n.read ? 400 : 500 }}>{n.subject}</div>
                <div className="tag">{n.text}</div>
              </div>
              <span className="tag" style={{ whiteSpace: 'nowrap' }}>
                {shortDate(n.at)}
              </span>
            </div>
          ))
        ) : (
          <p className="muted" style={{ fontSize: 14 }}>
            Nothing yet. Order updates, reminders and answers from us show up here.
          </p>
        )}
      </GlassCard>
    </BuyerShell>
  );
}
