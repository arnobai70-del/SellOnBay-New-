import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { getOrder } from '@/lib/orders/service';
import { orderCode } from '@/lib/payments/rules';
import { listAttempts, listMethods, listRefunds } from '@/lib/payments/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Payments to check', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };

/*
 * Finance (F-5, D-I). A buyer's report or screenshot is never proof that money arrived: reconcile only against the bank or wallet statement.
 * Payment methods are entered here; nothing about banks or wallets is in the code.
 */
export default async function PaymentsReview() {
  const viewer = await requireViewer({ path: '/dashboard/admin/payments-review', roles: ['admin'], scope: 'finance' });
  const [methods, queue, refunds] = await Promise.all([listMethods(), listAttempts(['submitted']), listRefunds({ statuses: ['requested', 'approved'] })]);
  const orders = new Map(await Promise.all([...new Set([...queue.map((a) => a.orderId), ...refunds.map((r) => r.orderId)])].map(async (id) => [id, await getOrder(id)] as const)));
  const methodName = new Map(methods.map((m) => [m.id, m.label]));
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-payments-review" title="Payments to check">
      <div className="dp" data-reconcile-queue>
        <div className="hd">
          <div>
            <h2>Reported payments ({queue.length})</h2>
            <p className="sub">Check each one against your bank or wallet statement. Enter what actually arrived; an order is paid only when the received money covers it.</p>
          </div>
        </div>
        {queue.length === 0 && <p className="muted">Nothing to check.</p>}
        <ul className="lst">
          {queue.map((a) => {
            const o = orders.get(a.orderId);
            return (
              <li key={a.id} data-attempt={a.id}>
                <div className="grow">
                  <b>
                    {o?.title ?? 'Order'} · {orderCode(a.orderId)} · due {o ? usd(o.priceCents) : '?'}
                  </b>
                  <small>
                    Buyer says {usd(a.amountClaimedCents)} {a.currency} by {methodName.get(a.methodId ?? '') ?? 'a method'} on {a.paidOn}, reference {a.reference} · reported {day(a.createdAt)}
                  </small>
                  {a.proofPath ? (
                    <a className="btn btn-line btn-sm" href={`/api/admin/payments/${a.id}/proof`} target="_blank" rel="noopener noreferrer">
                      Open the proof (logged)
                    </a>
                  ) : (
                    <small className="muted">No proof attached.</small>
                  )}
                  <div className="act-row">
                    <AdminForm
                      endpoint={`/api/admin/payments/${a.id}`}
                      fixed={{ action: 'reconcile' }}
                      openLabel="Money arrived"
                      submit="Reconcile"
                      tone="blue"
                      fields={[
                        { name: 'amountReceived', label: 'Amount that actually arrived (in the method currency)', kind: 'text', required: true },
                        { name: 'statementRef', label: 'Reference on your statement', kind: 'text', required: true },
                        { name: 'receivedOn', label: 'Date it arrived (YYYY-MM-DD)', kind: 'text', required: true },
                        { name: 'note', label: 'Note (optional)', kind: 'textarea' },
                      ]}
                    />
                    <AdminForm
                      endpoint={`/api/admin/payments/${a.id}`}
                      fixed={{ action: 'reject' }}
                      openLabel="Not received"
                      submit="Reject"
                      tone="line"
                      fields={[{ ...why, label: 'Why (the buyer sees it)' }]}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="dp" data-refunds>
        <div className="hd">
          <div>
            <h2>Refunds ({refunds.length})</h2>
            <p className="sub">Approve, send the money back by the same route, then record the reference. Nothing is refunded automatically.</p>
          </div>
        </div>
        {refunds.length === 0 && <p className="muted">No refunds waiting.</p>}
        <ul className="lst">
          {refunds.map((r) => (
            <li key={r.id}>
              <div className="grow">
                <b>
                  {usd(r.amountCents)} to the buyer of {orders.get(r.orderId)?.title ?? 'an order'} ({r.kind})
                </b>
                <small>
                  {r.status} · {r.reason}
                </small>
                <div className="act-row">
                  {r.status === 'requested' && <AdminForm endpoint={`/api/admin/refunds/${r.id}`} fixed={{ action: 'approve' }} fields={[]} openLabel="Approve" submit="Approve refund" tone="blue" />}
                  {r.status === 'approved' && (
                    <AdminForm
                      endpoint={`/api/admin/refunds/${r.id}`}
                      fixed={{ action: 'paid' }}
                      openLabel="Record as paid"
                      submit="Record"
                      tone="blue"
                      fields={[
                        { name: 'method', label: 'How the money was sent back', kind: 'text', required: true },
                        { name: 'reference', label: 'Reference of the refund payment', kind: 'text', required: true },
                      ]}
                    />
                  )}
                  {r.status === 'requested' && <AdminForm endpoint={`/api/admin/refunds/${r.id}`} fixed={{ action: 'cancel' }} fields={[why]} openLabel="Cancel" submit="Cancel refund" tone="line" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Refund a paid order</h2>
            <p className="sub">For an order that is paid but not yet accepted. Delivered orders go through Disputes.</p>
          </div>
        </div>
        <AdminForm
          endpoint="/api/admin/orders/refund-by-id"
          openLabel="Refund an order"
          submit="Refund"
          tone="line"
          fields={[{ name: 'orderId', label: 'Order id', kind: 'text', required: true }, why]}
        />
      </div>

      <div className="dp" data-methods>
        <div className="hd">
          <div>
            <h2>Payment methods</h2>
            <p className="sub">What buyers see on their payment page. Only add banks and wallets SellOnBay is confirmed eligible to use (blocker B-1).</p>
          </div>
        </div>
        <ul className="lst">
          {methods.map((m) => (
            <li key={m.id}>
              <div className="grow">
                <b>
                  {m.label} ({m.kind.replace('_', ' ')}, {m.currency}) · {m.active ? 'shown to buyers' : 'hidden'}
                </b>
                <small style={{ whiteSpace: 'pre-wrap' }}>{m.instructions}</small>
                <AdminForm
                  endpoint="/api/admin/payments/methods"
                  fixed={{ id: m.id, kind: m.kind }}
                  openLabel="Change"
                  submit="Save"
                  tone="line"
                  fields={[
                    { name: 'label', label: 'Name', kind: 'text', value: m.label, required: true },
                    { name: 'instructions', label: 'Instructions buyers see', kind: 'textarea', value: m.instructions, required: true },
                    { name: 'currency', label: 'Currency', kind: 'text', value: m.currency, required: true },
                    {
                      name: 'active',
                      label: 'Shown to buyers',
                      kind: 'select',
                      options: [
                        ['off', 'Hidden'],
                        ['on', 'Shown'],
                      ],
                    },
                    why,
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
        <AdminForm
          endpoint="/api/admin/payments/methods"
          openLabel="Add a method"
          submit="Add"
          tone="blue"
          fields={[
            {
              name: 'kind',
              label: 'Kind',
              kind: 'select',
              options: [
                ['bank_transfer', 'Business bank transfer'],
                ['local_wallet', 'Local wallet'],
              ],
            },
            { name: 'label', label: 'Name', kind: 'text', required: true },
            { name: 'instructions', label: 'Instructions buyers see (account details)', kind: 'textarea', required: true },
            { name: 'currency', label: 'Currency', kind: 'text', value: 'USD', required: true },
            {
              name: 'active',
              label: 'Shown to buyers',
              kind: 'select',
              options: [
                ['off', 'Hidden for now'],
                ['on', 'Shown'],
              ],
            },
            why,
          ]}
        />
      </div>
    </DashShell>
  );
}
