import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { StatusPill } from '@/components/glass/StatusPill';
import { PAYOUT_TEXT, PLAN_FEE_TEXT } from '@/lib/config';
import { usd } from '@/lib/glass/orderStatus';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { listPayouts, type Payout } from '@/lib/payouts';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Finance and payouts', robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * Finance: what the ledger holds by kind of account (a reconciliation view: money in escrow, owed to sellers, held back, owed back, earned), and the
 * weekly payouts. Read only here; the CSV, marking paid and the PayPal button stay at the payouts tool. Beta orders are $0 and never touch the ledger.
 */
export default async function AdminFinance() {
  const viewer = await requireViewer({ path: '/admin/finance', roles: ['admin'], scope: 'finance' });
  const L = await ledgerStore();
  const sum = async (prefix: string) => (await L.balances(prefix)).reduce((s, b) => s + Math.max(0, b.holds), 0);
  const [escrow, pending, available, reserve, debt, held, refundDue, revenue, payouts] = await Promise.all([
    sum('order_escrow:'),
    sum('seller_pending:'),
    sum('seller_available:'),
    sum('seller_reserve:'),
    sum('seller_debt:'),
    sum('buyer_payment_held:'),
    sum('buyer_refund_due:'),
    L.balance(acct.revenue),
    listPayouts({}),
  ]);
  const toSend = payouts.filter((p) => p.status === 'scheduled' || p.status === 'exported');
  return (
    <AdminShell viewer={viewer} active="finance" title="Finance & payouts" subtitle={`Platform fee ${PLAN_FEE_TEXT}. ${PAYOUT_TEXT}.`}>
      <div className="g-kpis">
        <Kpi label="In escrow" value={usd(escrow)} note="Paid, not accepted yet" />
        <Kpi label="Owed to sellers" value={usd(pending + available + reserve)} note={`${usd(available)} ready for Thursday`} />
        <Kpi label="Platform revenue" value={usd(revenue)} note="Fees on accepted orders" />
        <Kpi label="To send" value={toSend.length} note={usd(toSend.reduce((s, p) => s + p.amountCents, 0))} />
      </div>
      <GlassCard as="section">
        <h2>Reconciliation</h2>
        <p className="g-tag">From the double-entry ledger. Check each line against the bank, wallet and provider statements.</p>
        {(
          [
            ['Buyer money in escrow', escrow],
            ['Sellers, on the 7-day hold', pending],
            ['Sellers, available for payout', available],
            ['Sellers, reserve', reserve],
            ['Owed by sellers after refunds', debt],
            ['Reported payments held, not matched to an order yet', held],
            ['Refunds owed to buyers', refundDue],
            ['Platform revenue', revenue],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="g-li">
            <span style={{ flex: 1 }}>{label}</span>
            <b>{usd(n)}</b>
          </div>
        ))}
      </GlassCard>
      <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
        <div className="g-row" style={{ padding: '0 14px 6px' }}>
          <h2>Payouts</h2>
          <Link href="/dashboard/admin/payouts">CSV, mark paid, send by PayPal</Link>
        </div>
        <DataTable<Payout>
          caption="Payouts"
          rows={payouts.slice(0, 100)}
          rowKey={(p) => p.id}
          empty="No payouts yet."
          columns={[
            { key: 'week', label: 'Payout day', cell: (p) => p.weekStart },
            { key: 'seller', label: 'Seller', cell: (p) => p.sellerName },
            { key: 'method', label: 'Method', cell: (p) => p.method },
            { key: 'amount', label: 'Amount', cell: (p) => usd(p.amountCents) },
            {
              key: 'status',
              label: 'Status',
              cell: (p) => (
                <StatusPill tone={p.status === 'paid' ? 'ok' : p.status === 'failed' ? 'bad' : 'info'}>
                  {p.status === 'paid' ? 'Paid' : p.status === 'failed' ? 'Failed' : p.status === 'exported' ? 'Being sent' : 'Scheduled'}
                </StatusPill>
              ),
            },
          ]}
        />
      </GlassCard>
    </AdminShell>
  );
}
