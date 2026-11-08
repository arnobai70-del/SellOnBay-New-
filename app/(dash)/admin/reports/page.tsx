import type { Metadata } from 'next';
import { ReportsPanel } from '@/components/ReportsPanel';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { usd } from '@/lib/glass/orderStatus';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Reports', robots: { index: false } };
export const dynamic = 'force-dynamic';

const BETA = ['beta_requested', 'beta_approved', 'beta_declined'];
const DONE = ['accepted', 'payout_pending', 'paid_out', 'beta_approved'];

/* Orders by month for the last six months (counted from the orders themselves), and the sales PDFs Finance exports (Blueprint 8.2). */
export default async function AdminReports() {
  const viewer = await requireViewer({ path: '/admin/reports', roles: ['admin'], scope: 'finance' });
  const orders = await (await orderStore()).changedSince(Date.now() - 186 * 86_400_000);
  const months = new Map<string, { month: string; orders: number; beta: number; done: number; sales: number }>();
  for (const o of orders) {
    const month = new Date(o.createdAt).toISOString().slice(0, 7);
    const m = months.get(month) ?? { month, orders: 0, beta: 0, done: 0, sales: 0 };
    m.orders++;
    if (BETA.includes(o.state)) m.beta++;
    if (DONE.includes(o.state)) m.done++;
    if (o.fundedAt) m.sales += o.priceCents - o.refundedCents;
    months.set(month, m);
  }
  const rows = [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <AdminShell viewer={viewer} active="reports" title="Reports" subtitle="Orders by month and sales exports. Beta requests are counted, at $0.">
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <h2 style={{ padding: '0 14px 6px' }}>Orders by month</h2>
        <DataTable<(typeof rows)[number]>
          caption="Orders by month"
          rows={rows}
          rowKey={(r) => r.month}
          empty="No orders in the last six months."
          columns={[
            { key: 'month', label: 'Month', cell: (r) => r.month },
            { key: 'orders', label: 'Orders', cell: (r) => r.orders },
            { key: 'beta', label: 'Beta requests', cell: (r) => r.beta },
            { key: 'done', label: 'Completed', cell: (r) => r.done },
            { key: 'sales', label: 'Paid sales', cell: (r) => usd(r.sales) },
          ]}
        />
      </GlassCard>
      <GlassCard as="section">
        <h2>Sales exports</h2>
        <ReportsPanel me={viewer?.id ?? 'demo-admin'} scope="admin" />
      </GlassCard>
    </AdminShell>
  );
}
