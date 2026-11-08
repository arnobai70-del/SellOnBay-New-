import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { StatusPill } from '@/components/glass/StatusPill';
import { listReports } from '@/lib/admin/queue';
import { adminOverdue, openDisputes, REASON_LABEL, sellerOverdue, type Dispute } from '@/lib/disputes';
import { shortDate } from '@/lib/glass/orderStatus';
import { listTickets } from '@/lib/messaging/store';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Disputes and support', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Disputes (money stays in escrow while one is open), support tickets and abuse reports. Each opens in its full tool to answer or decide. */
export default async function AdminSupportHub() {
  const viewer = await requireViewer({ path: '/admin/support', roles: ['admin'], scope: 'support' });
  const [disputes, tickets, reports] = await Promise.all([openDisputes(), listTickets(), listReports(true)]);
  const open = tickets.filter((t) => t.status === 'open');
  const now = Date.now();
  return (
    <AdminShell viewer={viewer} active="support" title="Disputes & support" subtitle="A dispute keeps the money in escrow until it is decided. The seller may fix first.">
      <div className="g-kpis">
        <Kpi label="Open disputes" value={disputes.length} note={`${disputes.filter((d) => adminOverdue(d, now)).length} past our deadline`} />
        <Kpi label="Tickets waiting" value={open.length} note={<Link href="/dashboard/admin/support">Answer tickets</Link>} />
        <Kpi label="Abuse reports" value={reports.length} note={<Link href="/dashboard/admin/abuse">Review reports</Link>} />
      </div>
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <h2 style={{ padding: '0 14px 6px' }}>Open disputes</h2>
        <DataTable<Dispute>
          caption="Open disputes"
          rows={disputes}
          rowKey={(d) => d.id}
          empty="No open disputes."
          columns={[
            { key: 'order', label: 'Order', cell: (d) => <Link href={`/dashboard/admin/disputes/${d.id}`}>{orderCode(d.orderId)}</Link> },
            { key: 'reason', label: 'Reason', cell: (d) => REASON_LABEL[d.reason] },
            { key: 'opened', label: 'Opened', cell: (d) => shortDate(d.createdAt) },
            {
              key: 'state',
              label: 'Status',
              cell: (d) =>
                adminOverdue(d, now) ? (
                  <StatusPill tone="bad">Past our deadline</StatusPill>
                ) : sellerOverdue(d, now) ? (
                  <StatusPill tone="wait">Seller did not reply</StatusPill>
                ) : d.status === 'seller_replied' ? (
                  <StatusPill tone="info">Seller replied</StatusPill>
                ) : (
                  <StatusPill tone="wait">Waiting for seller</StatusPill>
                ),
            },
          ]}
        />
      </GlassCard>
      <GlassCard as="section">
        <h2>Tickets waiting for us</h2>
        {open.length ? (
          open.slice(0, 20).map((t) => (
            <div key={t.id} className="g-li">
              <span style={{ flex: 1 }}>
                <Link href={`/dashboard/admin/support?t=${t.id}`}>{t.subject}</Link>
              </span>
              <span className="g-tag">{t.openerRole}</span>
            </div>
          ))
        ) : (
          <p className="g-muted" style={{ marginTop: 8 }}>
            No tickets waiting.
          </p>
        )}
      </GlassCard>
    </AdminShell>
  );
}
