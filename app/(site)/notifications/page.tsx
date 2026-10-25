import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkRead } from '@/components/MarkRead';
import { notificationsFor } from '@/lib/notify';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Notifications() {
  await requireViewer({ path: '/notifications' });
  const id = await getViewerId();
  const list = id ? await notificationsFor(id) : [];
  return (
    <div className="wrap page-body">
      <div className="page-head">
        <h1>Notifications</h1>
      </div>
      {list.length === 0 ? (
        <div className="empty-note">
          <b>Nothing yet.</b>
          <span>
            Order updates, reminders and messages from us show up here. <Link href="/">Browse templates</Link>
          </span>
        </div>
      ) : (
        <>
          <MarkRead />
          <ul className="notifs">
            {list.map((n) => (
              <li key={n.id} className={n.read ? 'read' : 'unread'}>
                <b>{n.subject}</b>
                <span>{n.text}</span>
                <small className="muted">{new Date(n.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
