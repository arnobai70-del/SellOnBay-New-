import type { Metadata } from 'next';
import Link from 'next/link';
import { MarkRead } from '@/components/MarkRead';
import { notificationsFor } from '@/lib/notify';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Notifications'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function Notifications() {
  await requireViewer({ path: '/notifications' });
  const id = await getViewerId();
  const list = id ? await notificationsFor(id) : [];
  return (
    <div className="wrap sob-page-body">
      <div className="sob-page-head">
        <h1>
          <T s={'Notifications'} />
        </h1>
      </div>
      {list.length === 0 ? (
        <div className="sob-empty-note">
          <b>
            <T s={'Nothing yet.'} />
          </b>
          <span>
            <T s={'Order updates, reminders and messages from us show up here.'} />{' '}
            <Link href="/">
              <T s={'Browse templates'} />
            </Link>
          </span>
        </div>
      ) : (
        <>
          <MarkRead />
          <ul className="sob-notifs">
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
