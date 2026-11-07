import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DeliveryForm } from '@/components/DeliveryForm';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { SellerShell } from '@/components/glass/SellerShell';
import { StatusPill } from '@/components/glass/StatusPill';
import { sellerDashboard, type SellerView } from '@/lib/dashboard';
import { listFiles } from '@/lib/files/store';
import { buyerStatus, shortDate, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import type { Order } from '@/lib/orders/machine';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Orders and escrow', robots: { index: false } };
export const dynamic = 'force-dynamic';

const timeLeft = (dueAt: number | null | undefined, now: number) => {
  if (!dueAt) return 'No deadline';
  const h = Math.floor((dueAt - now) / 3_600_000);
  if (h < 0) return 'Overdue';
  return h >= 48 ? `${Math.floor(h / 24)} days left` : `${h} hours left`;
};

/* Orders the seller has to deliver, with the same actions as before (deliver, GitHub invite, files, record), then every order sold. */
export default async function SellerOrders() {
  const viewer = await requireViewer({ path: '/dashboard/seller/orders', roles: ['seller', 'admin'] });
  const [v, files, all] = viewer ? await Promise.all([sellerDashboard(viewer.id), listFiles({ uploadedBy: viewer.id }), (await orderStore()).forUser(viewer.id)]) : [null, [], [] as Order[]];
  const sold = all.filter((o) => o.sellerId === viewer?.id).sort((a, b) => b.createdAt - a.createdAt);
  const deliveryFiles = (orderId: string) => files.filter((f) => f.purpose === 'delivery' && f.orderId === orderId);
  const now = Date.now();
  type Row = SellerView['toDeliver'][number];
  return (
    <SellerShell viewer={viewer} active="orders" title="Orders & escrow" subtitle="The buyer's money is held in escrow. Deliver before the time runs out; you are paid after the buyer accepts.">
      {v && (
        <>
          <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
            <h2 style={{ padding: '0 14px 6px' }}>To deliver</h2>
            <DataTable<Row>
              caption="Orders to deliver"
              rows={v.toDeliver}
              rowKey={(r) => r.order.id}
              empty="Nothing to deliver right now."
              columns={[
                {
                  key: 'order',
                  label: 'Order',
                  cell: ({ order: o }) => (
                    <>
                      <b>{plainWords(o.title)}</b>
                      {o.express && <div className="g-tag">Express</div>}
                    </>
                  ),
                },
                { key: 'domain', label: "Buyer's domain", cell: ({ order: o }) => o.domain?.name ?? (o.githubUsername ? `GitHub: ${o.githubUsername}` : '-') },
                { key: 'time', label: 'Time left', cell: ({ order: o, held }) => (held ? 'Paused for a safety check' : timeLeft(o.dueAt, now)) },
                { key: 'earn', label: 'You earn', cell: ({ earnCents }) => usd(earnCents) },
                {
                  key: 'actions',
                  label: 'Actions',
                  hideLabel: true,
                  cell: ({ order: o }) => (
                    <div className="g-stack" style={{ gap: 6 }}>
                      <Link href={`/messages/${o.id}`}>Open chat</Link>
                      {/* A quotation order's delivery is sent for release and released by SellOnBay; the seller never marks it delivered. */}
                      {o.quotationId && o.state === 'funded' && <span className="g-tag">Waiting for SellOnBay to authorise the work.</span>}
                      {o.quotationId && o.state === 'release_pending' && <span className="g-tag">Sent. Waiting for SellOnBay to release it.</span>}
                      {o.quotationId && ['in_delivery', 'overdue', 'fix_requested'].includes(o.state) && (
                        <DeliveryForm
                          orderId={o.id}
                          approvedFiles={deliveryFiles(o.id)
                            .filter((f) => f.state === 'approved')
                            .map((f) => ({ id: f.id, name: f.originalName }))}
                          pending={deliveryFiles(o.id).filter((f) => ['awaiting_upload', 'checking', 'awaiting_review'].includes(f.state)).length}
                        />
                      )}
                      {!o.quotationId &&
                        (o.state === 'fix_requested' || (o.deliveryType !== 'repo_access' && !o.instant && (o.state === 'funded' || o.state === 'in_delivery' || o.state === 'overdue'))) && (
                          <AdminForm endpoint={`/api/orders/${o.id}/deliver`} fields={[]} submit="Yes, it is live and ready" openLabel="I delivered it" tone="dark" />
                        )}
                      {o.deliveryType === 'repo_access' && (o.quotationId ? o.state === 'delivered' && !!o.releaseApprovedAt : o.state === 'funded' || o.state === 'in_delivery') && (
                        <AdminForm
                          endpoint={o.state === 'funded' ? `/api/orders/${o.id}/handover` : `/api/orders/${o.id}/resend-invite`}
                          fields={[]}
                          submit={o.state === 'funded' ? 'I sent the invite' : 'Send the invite again'}
                          openLabel={o.state === 'funded' ? 'I sent the invite' : 'Send the invite again'}
                          tone="line"
                        />
                      )}
                      <a href={`/api/orders/${o.id}/evidence`} download>
                        Record (PDF)
                      </a>
                    </div>
                  ),
                },
              ]}
            />
          </GlassCard>
          {v.revocations.length > 0 && (
            <GlassCard as="section" data-revocations>
              <h2>Remove access to a repository</h2>
              <p className="g-tag">These orders were refunded or cancelled after you sent the GitHub invite. Remove the buyer from your private repository, then tell us.</p>
              {v.revocations.map((c) => (
                <div key={c.orderId} className="g-li">
                  <span style={{ flex: 1 }}>
                    {plainWords(c.title)} · remove GitHub user {c.github || 'the buyer'}
                  </span>
                  <AdminForm endpoint={`/api/orders/${c.orderId}/revoke-done`} fields={[]} submit="I removed the access" openLabel="I removed the access" tone="dark" />
                </div>
              ))}
            </GlassCard>
          )}
          <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
            <h2 style={{ padding: '0 14px 6px' }}>All orders</h2>
            <DataTable<Order>
              caption="All orders"
              rows={sold.slice(0, 100)}
              rowKey={(o) => o.id}
              empty="No orders yet."
              columns={[
                { key: 'id', label: 'Order', cell: (o) => <Link href={`/orders/${o.id}`}>{orderCode(o.id)}</Link> },
                { key: 'item', label: 'Item', cell: (o) => plainWords(o.title) },
                { key: 'date', label: 'Date', cell: (o) => shortDate(o.createdAt) },
                { key: 'amount', label: 'Price', cell: (o) => usd(o.priceCents) },
                { key: 'status', label: 'Status', cell: (o) => <StatusPill tone={buyerStatus(o.state).tone}>{buyerStatus(o.state).label}</StatusPill> },
              ]}
            />
          </GlassCard>
        </>
      )}
    </SellerShell>
  );
}
