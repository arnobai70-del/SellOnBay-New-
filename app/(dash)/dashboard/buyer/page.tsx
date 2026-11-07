import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { Button } from '@/components/glass/Button';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { StatusPill } from '@/components/glass/StatusPill';
import { buyerOverview } from '@/lib/glass/buyer';
import { buyerStatus, shortDate, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import type { Order } from '@/lib/orders/machine';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Buyer overview', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function BuyerOverview() {
  const viewer = await requireViewer({ path: '/dashboard/buyer', roles: ['buyer', 'seller'] });
  const v = viewer ? await buyerOverview(viewer.id) : null;
  const first = viewer?.name?.split(' ')[0];
  return (
    <BuyerShell viewer={viewer} active="overview" title={first ? `Welcome back, ${first}` : 'Welcome back'} subtitle="Your websites, orders and domains in one place">
      {v && (
        <>
          <div className="g-kpis">
            <Kpi label="Websites owned" value={v.owned} note={v.owned ? 'Ready to download' : 'None yet'} />
            <Kpi label="In review" value={v.inReview} note="Waiting on you or on us" />
            <Kpi label="Domains" value={v.domains.length} note={v.domains.some((d) => d.status === 'requested') ? 'Some being registered' : 'In your own name'} />
            <Kpi label="Open tickets" value={v.openTickets} note={v.openTickets ? 'We are on it' : 'All quiet'} />
          </div>
          <div className="g-grid2">
            <GlassCard as="section">
              <h2>Latest updates</h2>
              {v.notes.length ? (
                v.notes.slice(0, 4).map((n) => (
                  <div key={n.id} className="g-li">
                    <span style={{ flex: 1, fontSize: 14 }}>{n.subject}</span>
                    <span className="g-tag">{shortDate(n.at)}</span>
                  </div>
                ))
              ) : (
                <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                  Nothing yet. Order updates show up here.
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <Button variant="ghost" size="sm" href="/dashboard/buyer/notifications">
                  See all
                </Button>
              </div>
            </GlassCard>
            <GlassCard as="section">
              <h2>Find your next website</h2>
              <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                Websites are free for early users during the beta.
              </p>
              <div style={{ marginTop: 14 }}>
                <Button href="/websites">Browse websites</Button>
              </div>
            </GlassCard>
          </div>
          <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
            <div className="g-row" style={{ padding: '0 14px 6px' }}>
              <h2>Recent orders</h2>
              <Link href="/dashboard/buyer/orders">All orders</Link>
            </div>
            <DataTable<Order>
              caption="Recent orders"
              rows={v.orders.slice(0, 5)}
              rowKey={(o) => o.id}
              empty="No orders yet."
              columns={[
                { key: 'id', label: 'Order', cell: (o) => <Link href={`/orders/${o.id}`}>{orderCode(o.id)}</Link> },
                { key: 'item', label: 'Item', cell: (o) => plainWords(o.title) },
                { key: 'date', label: 'Date', cell: (o) => shortDate(o.createdAt) },
                { key: 'amount', label: 'Amount', cell: (o) => usd(o.priceCents) },
                { key: 'status', label: 'Status', cell: (o) => <StatusPill tone={buyerStatus(o.state).tone}>{buyerStatus(o.state).label}</StatusPill> },
              ]}
            />
          </GlassCard>
        </>
      )}
    </BuyerShell>
  );
}
