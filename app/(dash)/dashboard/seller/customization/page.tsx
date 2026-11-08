import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { SellerShell } from '@/components/glass/SellerShell';
import { StatusPill, type PillTone } from '@/components/glass/StatusPill';
import { CONFIG } from '@/lib/config';
import { sellerDashboard, type SellerView } from '@/lib/dashboard';
import { usd } from '@/lib/glass/orderStatus';
import { storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Customization', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATE: Record<string, [string, PillTone]> = { pending: ['Waiting for buyer', 'wait'], funded: ['Funded, start work', 'ok'], declined: ['Declined', 'bad'], cancelled: ['Taken back', 'draft'] };

/* Extra work on an order: the seller sends it from the order page, the buyer pays it into escrow, and work starts only once it shows Funded. */
export default async function SellerCustomization() {
  const viewer = await requireViewer({ path: '/dashboard/seller/customization', roles: ['seller', 'admin'] });
  const [v, store] = viewer ? await Promise.all([sellerDashboard(viewer.id), storeProfile(viewer.id, viewer.name)]) : [null, null];
  type Row = SellerView['extras'][number];
  const x = CONFIG.extraWork;
  return (
    <SellerShell viewer={viewer} active="customization" title="Customization" subtitle="Paid changes on top of an order. The buyer pays into escrow before you start.">
      {v && store && (
        <>
          <GlassCard as="section">
            <h2>How it works</h2>
            <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
              Open an order and send an extra work request with a title, a price from {usd(x.minCents)} to {usd(x.maxCents)} and {x.minDays} to {x.maxDays} more days. Only before you deliver. Start
              when it shows Funded.
            </p>
            <p className="g-tag" style={{ marginTop: 8 }}>
              Your store {store.customAvailable ? 'shows' : 'does not show'} &ldquo;Available for customization&rdquo;. <Link href="/dashboard/seller/store">Change it</Link>
            </p>
          </GlassCard>
          <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
            <h2 style={{ padding: '0 14px 6px' }}>Extra work you sent</h2>
            <DataTable<Row>
              caption="Extra work you sent"
              rows={v.extras}
              rowKey={(r) => r.request.id}
              empty="No extra work requests yet."
              columns={[
                { key: 'title', label: 'Work', cell: ({ request }) => request.title },
                { key: 'order', label: 'Order', cell: ({ order }) => <Link href={`/orders/${order.id}`}>{plainWords(order.title)}</Link> },
                { key: 'price', label: 'Price', cell: ({ request }) => usd(request.priceCents) },
                { key: 'days', label: 'More days', cell: ({ request }) => `+${request.addDays}` },
                {
                  key: 'state',
                  label: 'Status',
                  cell: ({ request }) => {
                    const [label, tone] = STATE[request.state] ?? [request.state, 'draft'];
                    return <StatusPill tone={tone}>{label}</StatusPill>;
                  },
                },
              ]}
            />
          </GlassCard>
        </>
      )}
    </SellerShell>
  );
}
