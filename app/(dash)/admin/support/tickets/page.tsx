import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { ConversationPanel } from '@/components/ConversationPanel';
import { DashShell } from '@/components/DashShell';
import { listTickets } from '@/lib/messaging/store';
import { personNames } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Support tickets'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Support answers buyers' and sellers' tickets. Buyers and sellers never see each other's tickets. */
export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/support/tickets', roles: ['admin'], scope: 'support' });
  const { t } = await searchParams;
  const tickets = await listTickets();
  const open = tickets.find((x) => x.id === t) ?? null;
  const names = await personNames(tickets.map((x) => x.openedBy));
  const groups: [string, typeof tickets][] = [
    [tx('Waiting for SellOnBay'), tickets.filter((x) => x.status === 'open')],
    [tx('Waiting for the person'), tickets.filter((x) => x.status === 'waiting_user')],
    [tx('Closed (recent)'), tickets.filter((x) => x.status === 'closed').slice(0, 20)],
  ];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-support" title={tx('Support tickets')}>
      {open && (
        <>
          <ConversationPanel type="ticket" id={open.id} me="admin" heading={`${open.subject} (${open.openerRole}: ${names.get(open.openedBy) ?? 'user'})`} />
          <div className="glass card sob-sec">
            {open.orderId && (
              <p>
                <Link href={`/admin/orders/${open.orderId}`}>
                  <T s={'Open the order'} />
                </Link>
              </p>
            )}
            <AdminForm
              endpoint={`/api/tickets/${open.id}`}
              openLabel={tx('Change status')}
              submit={tx('Save')}
              tone="line"
              fields={[
                {
                  name: 'status',
                  label: tx('Status'),
                  kind: 'select',
                  options: [
                    ['open', tx('Waiting for SellOnBay')],
                    ['waiting_user', tx('Waiting for the person')],
                    ['closed', 'Closed'],
                  ],
                },
              ]}
            />
          </div>
        </>
      )}
      {groups.map(([title, list]) => (
        <div className="glass card sob-sec" key={title}>
          <div className="row sob-hd">
            <div>
              <h2>
                {title} ({list.length})
              </h2>
            </div>
          </div>
          <ul className="sob-list">
            {list.map((x) => (
              <li key={x.id}>
                <div className="sob-grow">
                  <b>
                    <Link href={`/admin/support/tickets?t=${x.id}`}>{x.subject}</Link>
                  </b>
                  <small>
                    <T s={'{openerRole} · {v1} · updated {v2}'} v={{ openerRole: x.openerRole, v1: names.get(x.openedBy) ?? 'user', v2: new Date(x.updatedAt).toUTCString().slice(0, 22) }} />
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </DashShell>
  );
}
