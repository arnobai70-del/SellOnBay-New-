import type { Metadata } from 'next';
import { GlassCard } from '@/components/glass/GlassCard';
import { SellerShell } from '@/components/glass/SellerShell';
import { MarkRead } from '@/components/MarkRead';
import { shortDate } from '@/lib/glass/orderStatus';
import { sellerNotes } from '@/lib/glass/seller';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SellerNotifications() {
  const viewer = await requireViewer({ path: '/dashboard/seller/notifications', roles: ['seller', 'admin'] });
  const list = viewer ? await sellerNotes(viewer.id) : [];
  const unread = list.filter((n) => !n.read).length;
  return (
    <SellerShell viewer={viewer} active="notifications" title="Notifications" subtitle={`${unread} unread`} actions={unread ? <MarkRead /> : undefined}>
      <GlassCard as="section">
        {list.length ? (
          list.map((n) => (
            <div key={n.id} className="g-li" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: n.read ? 400 : 500 }}>{n.subject}</div>
                <div className="g-tag">{n.text}</div>
              </div>
              <span className="g-tag" style={{ whiteSpace: 'nowrap' }}>
                {shortDate(n.at)}
              </span>
            </div>
          ))
        ) : (
          <p className="g-muted" style={{ fontSize: 14 }}>
            Nothing yet. New orders, questions from buyers and payout news show up here.
          </p>
        )}
      </GlassCard>
    </SellerShell>
  );
}
