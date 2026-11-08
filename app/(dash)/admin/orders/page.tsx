import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Seg } from '@/components/glass/Seg';
import { StatusPill } from '@/components/glass/StatusPill';
import { allBetaFeedback, betaRequests, type BetaRequest } from '@/lib/beta/service';
import { buyerStatus, shortDate, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import type { Order } from '@/lib/orders/machine';
import { getOrder } from '@/lib/orders/service';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { listAttempts } from '@/lib/payments/store';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Orders and payments', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['beta', 'Beta requests'],
  ['payments', 'Payments to check'],
  ['all', 'All orders'],
] as const;
type Tab = (typeof TABS)[number][0];
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* Beta requests (approve or decline with a reason), payments buyers reported, every order of the last 30 days, and the manual order desk. */
export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/orders', roles: ['admin'], scope: ['delivery', 'support', 'finance'] });
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : 'beta';
  const settings = await getSettings();
  return (
    <AdminShell
      viewer={viewer}
      active="orders"
      title="Orders & payments"
      subtitle={settings.paymentsMode === 'beta_free' ? 'Free beta: nothing is charged. Approve a request to release its files.' : 'Live payments.'}
    >
      <Seg label="Order lists" value={tab} items={TABS.map(([k, l]) => ({ key: k, label: l, href: `/admin/orders?tab=${k}` }))} />
      {tab === 'beta' && <BetaTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'all' && <AllTab />}
      <GlassCard as="section" id="pos">
        <h2>Manual order (cash, point of sale)</h2>
        <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
          Cash is taken only at a point of sale run by an admin. It opens when live payments start, because how a cash payment enters the ledger is a money rule the owner has not set yet. During the
          beta, a customer asks for a website from its page and you approve it under Beta requests.
        </p>
      </GlassCard>
    </AdminShell>
  );
}

async function BetaTab() {
  const [all, feedback] = await Promise.all([betaRequests(), allBetaFeedback()]);
  const rows = await Promise.all(all.slice(0, 100).map(async (r) => ({ r, o: await getOrder(r.orderId), f: feedback.find((x) => x.orderId === r.orderId) })));
  const waiting = rows.filter((x) => !x.r.decidedAt);
  const decided = rows.filter((x) => x.r.decidedAt);
  const card = ({ r, o, f }: { r: BetaRequest; o: Order | null; f?: { rating: number; worked?: string | null; improve?: string | null } }) => (
    <div key={r.orderId} className="g-li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
      <b>
        <Link href={`/dashboard/admin/orders/${r.orderId}`}>{plainWords(o?.title ?? r.productKey)}</Link>
      </b>
      <span className="g-tag">
        {r.name} · {r.email} · {r.country}
        {r.company ? ` · ${r.company}` : ''}
        {r.domain ? ` · domain ${r.domain}` : ''} · {when(r.createdAt)}
      </span>
      <span style={{ fontSize: 14 }}>{r.useFor}</span>
      {r.decidedAt ? (
        <StatusPill tone={r.declineReason ? 'bad' : 'ok'}>{r.declineReason ? `Declined: ${r.declineReason}` : 'Approved'}</StatusPill>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label="Approve" body={{ decision: 'approve' }} />
          <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label="Decline" tone="line" body={{ decision: 'decline' }} note={{ label: 'Reason for the buyer', required: true }} />
        </div>
      )}
      {f && (
        <span className="g-tag">
          Feedback: {f.rating} of 5.{f.worked ? ` Worked: ${f.worked}.` : ''}
          {f.improve ? ` Improve: ${f.improve}.` : ''}
        </span>
      )}
    </div>
  );
  return (
    <>
      <GlassCard as="section">
        <h2>Waiting ({waiting.length})</h2>
        {waiting.length ? waiting.map(card) : <p className="g-muted">No requests waiting.</p>}
      </GlassCard>
      {decided.length > 0 && (
        <GlassCard as="section">
          <h2>Decided</h2>
          {decided.map(card)}
        </GlassCard>
      )}
    </>
  );
}

async function PaymentsTab() {
  const queue = await listAttempts(['submitted']);
  return (
    <GlassCard as="section">
      <h2>Reported payments ({queue.length})</h2>
      <p className="g-tag">A buyer&apos;s report or screenshot is never proof: check it against the bank or wallet statement.</p>
      {queue.length ? (
        queue.map((a) => (
          <div key={a.id} className="g-li">
            <span style={{ flex: 1 }}>{orderCode(a.orderId)}</span>
            <span className="g-tag">{usd(a.amountClaimedCents)} claimed</span>
          </div>
        ))
      ) : (
        <p className="g-muted" style={{ marginTop: 8 }}>
          Nothing to check.
        </p>
      )}
      <p style={{ marginTop: 12 }}>
        <Link href="/dashboard/admin/payments-review">Confirm or reject payments and refunds</Link>
      </p>
    </GlassCard>
  );
}

async function AllTab() {
  const orders = (await (await orderStore()).changedSince(Date.now() - 30 * 86_400_000)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  return (
    <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
      <h2 style={{ padding: '0 14px 6px' }}>Orders changed in the last 30 days</h2>
      <DataTable<Order>
        caption="Orders changed in the last 30 days"
        rows={orders}
        rowKey={(o) => o.id}
        empty="No orders in the last 30 days."
        columns={[
          { key: 'id', label: 'Order', cell: (o) => <Link href={`/dashboard/admin/orders/${o.id}`}>{orderCode(o.id)}</Link> },
          { key: 'item', label: 'Item', cell: (o) => plainWords(o.title) },
          { key: 'date', label: 'Date', cell: (o) => shortDate(o.createdAt) },
          { key: 'amount', label: 'Amount', cell: (o) => usd(o.priceCents) },
          { key: 'status', label: 'Status', cell: (o) => <StatusPill tone={buyerStatus(o.state).tone}>{buyerStatus(o.state).label}</StatusPill> },
        ]}
      />
    </GlassCard>
  );
}
