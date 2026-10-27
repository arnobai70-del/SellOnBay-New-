import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { ConversationPanel } from '@/components/ConversationPanel';
import { DashShell } from '@/components/DashShell';
import { listTickets } from '@/lib/messaging/store';
import { personNames } from '@/lib/requests/view';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Support tickets', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Support answers buyers' and sellers' tickets. Buyers and sellers never see each other's tickets. */
export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/support', roles: ['admin'], scope: 'support' });
  const { t } = await searchParams;
  const tickets = await listTickets();
  const open = tickets.find((x) => x.id === t) ?? null;
  const names = await personNames(tickets.map((x) => x.openedBy));
  const groups: [string, typeof tickets][] = [
    ['Waiting for SellOnBay', tickets.filter((x) => x.status === 'open')],
    ['Waiting for the person', tickets.filter((x) => x.status === 'waiting_user')],
    ['Closed (recent)', tickets.filter((x) => x.status === 'closed').slice(0, 20)],
  ];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-support" title="Support tickets">
      {open && (
        <>
          <ConversationPanel type="ticket" id={open.id} me="admin" heading={`${open.subject} (${open.openerRole}: ${names.get(open.openedBy) ?? 'user'})`} />
          <div className="dp">
            {open.orderId && (
              <p>
                <Link href={`/dashboard/admin/orders/${open.orderId}`}>Open the order</Link>
              </p>
            )}
            <AdminForm
              endpoint={`/api/tickets/${open.id}`}
              openLabel="Change status"
              submit="Save"
              tone="line"
              fields={[
                {
                  name: 'status',
                  label: 'Status',
                  kind: 'select',
                  options: [
                    ['open', 'Waiting for SellOnBay'],
                    ['waiting_user', 'Waiting for the person'],
                    ['closed', 'Closed'],
                  ],
                },
              ]}
            />
          </div>
        </>
      )}
      {groups.map(([title, list]) => (
        <div className="dp" key={title}>
          <div className="hd">
            <div>
              <h2>
                {title} ({list.length})
              </h2>
            </div>
          </div>
          <ul className="lst">
            {list.map((x) => (
              <li key={x.id}>
                <div className="grow">
                  <b>
                    <Link href={`/dashboard/admin/support?t=${x.id}`}>{x.subject}</Link>
                  </b>
                  <small>
                    {x.openerRole} · {names.get(x.openedBy) ?? 'user'} · updated {new Date(x.updatedAt).toUTCString().slice(0, 22)}
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
