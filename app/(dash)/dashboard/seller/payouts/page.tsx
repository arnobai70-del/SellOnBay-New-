import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { VerificationForm } from '@/components/glass/SellerForms';
import { SellerShell } from '@/components/glass/SellerShell';
import { StatusPill } from '@/components/glass/StatusPill';
import { PAYOUT_TEXT, PLAN_FEE_TEXT, PLAN_KEEP_TEXT } from '@/lib/config';
import { sellerDashboard, type SellerView } from '@/lib/dashboard';
import { usd } from '@/lib/glass/orderStatus';
import { storeProfile, verificationOf } from '@/lib/glass/seller';
import { payoutMethodsFor } from '@/lib/payoutDetails';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Earnings and payouts', robots: { index: false } };
export const dynamic = 'force-dynamic';

const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DOC: Record<string, string> = { passport: 'Passport', national_id: 'National ID card', driver_licence: 'Driver licence' };

/* Money: balances, where earnings go (bKash only for Bangladesh), identity verification and every payout. */
export default async function SellerPayouts() {
  const viewer = await requireViewer({ path: '/dashboard/seller/payouts', roles: ['seller', 'admin'] });
  const [v, store, ver] = viewer ? await Promise.all([sellerDashboard(viewer.id), storeProfile(viewer.id, viewer.name), verificationOf(viewer.id)]) : [null, null, null];
  type Payout = SellerView['payouts'][number];
  return (
    <SellerShell viewer={viewer} active="payouts" title="Earnings & payouts" subtitle={`You keep ${PLAN_KEEP_TEXT} of the list price; the platform fee is ${PLAN_FEE_TEXT}. ${PAYOUT_TEXT}`}>
      {v && store && ver && (
        <>
          <div className="g-kpis">
            <Kpi label="Available" value={usd(v.availableCents)} note={`Next payout ${shortDay(v.nextPayout)}`} />
            <Kpi label="On hold (7 days)" value={usd(v.pendingCents)} note="Accepted, waiting out the hold" />
            <Kpi label="In escrow" value={usd(v.escrowCents)} note="Not accepted yet" />
            <Kpi label="Owed back" value={usd(v.debtCents)} note={v.debtCents ? 'Taken from your next earnings' : 'Nothing owed'} />
          </div>
          <div className="g-grid2">
            <GlassCard as="section">
              <h2>Where we send your earnings</h2>
              <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                {store.payoutLabel ?? 'Not set yet. Add it so your weekly payouts can be sent.'}
              </p>
              <p className="g-tag">
                PayPal, Payoneer, Wise or a bank transfer anywhere.{store.country === 'BD' ? ' bKash is open to you because your country is Bangladesh.' : ''} We email you whenever this changes.
              </p>
              <div style={{ marginTop: 12 }}>
                <AdminForm
                  endpoint="/api/seller/payout"
                  submit="Save payout details"
                  openLabel={store.payoutLabel ? 'Change' : 'Add payout details'}
                  tone="line"
                  fields={[
                    { name: 'method', label: 'How you want to be paid', kind: 'select', options: payoutMethodsFor(store.country).map(([m, l]) => [m, l]) },
                    {
                      name: 'account',
                      label: 'Account',
                      kind: 'text',
                      required: true,
                      hint: 'For a bank: IBAN or account number, bank name and account holder. For PayPal, Payoneer or Wise: the email of that account. For bKash: your account number.',
                    },
                  ]}
                />
              </div>
              {!store.country && (
                <p className="g-tag" style={{ marginTop: 8 }}>
                  Add your country in <Link href="/dashboard/seller/account">Account</Link> first.
                </p>
              )}
            </GlassCard>
            <GlassCard as="section" id="verify">
              <h2>Identity verification</h2>
              {ver.status === 'approved' && (
                <p style={{ marginTop: 8 }}>
                  <StatusPill tone="ok">Verified</StatusPill> {ver.docType ? DOC[ver.docType] : ''}
                </p>
              )}
              {ver.status === 'pending' && (
                <p style={{ marginTop: 8 }}>
                  <StatusPill tone="wait">Being checked</StatusPill> We will tell you when it is done.
                </p>
              )}
              {(ver.status === 'none' || ver.status === 'rejected') && (
                <>
                  {ver.status === 'rejected' && (
                    <p style={{ marginTop: 8 }}>
                      <StatusPill tone="bad">Not accepted</StatusPill> {ver.note ?? 'Please send a clearer picture.'}
                    </p>
                  )}
                  <p className="g-tag" style={{ marginTop: 8 }}>
                    Needed before your first payout. A passport, national ID card or driver licence. Only our finance team sees it, and it is never shown to buyers.
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <VerificationForm />
                  </div>
                </>
              )}
            </GlassCard>
          </div>
          <GlassCard as="section" pad={false} style={{ padding: '14px 8px 4px' }}>
            <h2 style={{ padding: '0 14px 6px' }}>Payouts</h2>
            <DataTable<Payout>
              caption="Payouts"
              rows={v.payouts}
              rowKey={(p) => p.id}
              empty={`No payouts yet. ${PAYOUT_TEXT}`}
              columns={[
                { key: 'week', label: 'Week of', cell: (p) => shortDay(p.weekStart) },
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
        </>
      )}
    </SellerShell>
  );
}
