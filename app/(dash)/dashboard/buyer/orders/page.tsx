import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Seg } from '@/components/glass/Seg';
import { StatusPill } from '@/components/glass/StatusPill';
import { BETA_METHOD } from '@/lib/beta/rules';
import { buyerOrders } from '@/lib/glass/buyer';
import { buyerStatus, ORDER_TABS, orderTab, shortDate, usd, type OrderTab } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import type { Order } from '@/lib/orders/machine';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Orders and payments', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TAB_LABEL: Record<OrderTab, string> = { all: 'All', progress: 'In progress', done: 'Completed', refunded: 'Refunded' };
const method = (o: Order) => (o.payment?.brand === BETA_METHOD ? 'Free (beta)' : o.payment?.brand ? o.payment.brand : '—');

export default async function BuyerOrders({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/buyer/orders', roles: ['buyer'] });
  const { tab: raw } = await searchParams;
  const tab: OrderTab = (ORDER_TABS as readonly string[]).includes(String(raw)) ? (raw as OrderTab) : 'all';
  const orders = viewer ? await buyerOrders(viewer.id) : [];
  const shown = tab === 'all' ? orders : orders.filter((o) => orderTab(o.state) === tab);
  return (
    <BuyerShell
      viewer={viewer}
      active="orders"
      title="Orders & payments"
      subtitle="Every purchase, its payment and its receipt"
      actions={
        <Seg label="Order filter" value={tab} items={ORDER_TABS.map((t) => ({ key: t, label: TAB_LABEL[t], href: t === 'all' ? '/dashboard/buyer/orders' : `/dashboard/buyer/orders?tab=${t}` }))} />
      }
    >
      <GlassCard as="section" pad={false} style={{ padding: '8px 8px 4px' }}>
        <DataTable<Order>
          caption="Your orders"
          rows={shown}
          rowKey={(o) => o.id}
          empty="No orders here yet."
          columns={[
            { key: 'id', label: 'Order', cell: (o) => <Link href={`/orders/${o.id}`}>{orderCode(o.id)}</Link> },
            { key: 'date', label: 'Date', cell: (o) => shortDate(o.createdAt) },
            { key: 'item', label: 'Item', cell: (o) => plainWords(o.title) },
            { key: 'amount', label: 'Amount', cell: (o) => usd(o.priceCents) },
            { key: 'method', label: 'Method', cell: method },
            { key: 'status', label: 'Status', cell: (o) => <StatusPill tone={buyerStatus(o.state).tone}>{buyerStatus(o.state).label}</StatusPill> },
            {
              key: 'receipt',
              label: 'Receipt',
              hideLabel: true,
              align: 'right',
              cell: (o) =>
                o.fundedAt ? (
                  <a className="g-btn g-btn-ghost g-btn-sm" href={`/api/orders/${o.id}/receipt`}>
                    Receipt PDF
                  </a>
                ) : (
                  <span className="g-tag">No payment</span>
                ),
            },
          ]}
        />
      </GlassCard>
      <div className="g-grid2">
        <GlassCard as="section">
          <h2>How paying works</h2>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>During the beta</span>Websites are free, no payment is taken
          </div>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>Escrow</span>The seller is paid only after you approve, or after the review ends
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Refunds</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Something wrong? Open a ticket from <Link href="/dashboard/buyer/support">Support &amp; disputes</Link> while the order is in review. See the{' '}
            <Link href="/legal/refunds">refund policy</Link>.
          </p>
        </GlassCard>
      </div>
    </BuyerShell>
  );
}
