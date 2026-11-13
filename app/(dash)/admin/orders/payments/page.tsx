import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { getOrder } from '@/lib/orders/service';
import { orderCode } from '@/lib/payments/rules';
import { listAttempts, listMethods, listRefunds } from '@/lib/payments/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Payments to check'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const why = (tx: Tx) => ({ name: 'reason', label: tx('Why (goes in the audit log)'), kind: 'textarea' as const, required: true });

/*
 * Finance (F-5, D-I). A buyer's report or screenshot is never proof that money arrived: reconcile only against the bank or wallet statement.
 * Payment methods are entered here; nothing about banks or wallets is in the code.
 */
export default async function PaymentsReview() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/orders/payments', roles: ['admin'], scope: 'finance' });
  const [methods, queue, refunds] = await Promise.all([listMethods(), listAttempts(['submitted']), listRefunds({ statuses: ['requested', 'approved'] })]);
  const orders = new Map(await Promise.all([...new Set([...queue.map((a) => a.orderId), ...refunds.map((r) => r.orderId)])].map(async (id) => [id, await getOrder(id)] as const)));
  const methodName = new Map(methods.map((m) => [m.id, m.label]));
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-payments-review" title={tx('Payments to check')}>
      <div className="glass card sob-sec" data-reconcile-queue>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Reported payments ({length})'} v={{ length: queue.length }} />
            </h2>
            <p className="tag">
              <T s={'Check each one against your bank or wallet statement. Enter what actually arrived; an order is paid only when the received money covers it.'} />
            </p>
          </div>
        </div>
        {queue.length === 0 && (
          <p className="muted">
            <T s={'Nothing to check.'} />
          </p>
        )}
        <ul className="sob-list">
          {queue.map((a) => {
            const o = orders.get(a.orderId);
            return (
              <li key={a.id} data-attempt={a.id}>
                <div className="sob-grow">
                  <b>
                    <T s={'{v0} · {v1} · due {v2}'} v={{ v0: o?.title ?? 'Order', v1: orderCode(a.orderId), v2: o ? usd(o.priceCents) : '?' }} />
                  </b>
                  <small>
                    <T
                      s={'Buyer says {v0} {currency} by {v2} on {paidOn}, reference {reference} · reported {v5}'}
                      v={{ v0: usd(a.amountClaimedCents), currency: a.currency, v2: methodName.get(a.methodId ?? '') ?? 'a method', paidOn: a.paidOn, reference: a.reference, v5: day(a.createdAt) }}
                    />
                  </small>
                  {a.proofPath ? (
                    <a className="btn ghost sm" href={`/api/admin/payments/${a.id}/proof`} target="_blank" rel="noopener noreferrer">
                      <T s={'Open the proof (logged)'} />
                    </a>
                  ) : (
                    <small className="muted">
                      <T s={'No proof attached.'} />
                    </small>
                  )}
                  <div className="sob-acts">
                    <AdminForm
                      endpoint={`/api/admin/payments/${a.id}`}
                      fixed={{ action: 'reconcile' }}
                      openLabel={tx('Money arrived')}
                      submit={tx('Reconcile')}
                      tone="blue"
                      fields={[
                        { name: 'amountReceived', label: tx('Amount that actually arrived (in the method currency)'), kind: 'text', required: true },
                        { name: 'statementRef', label: tx('Reference on your statement'), kind: 'text', required: true },
                        { name: 'receivedOn', label: tx('Date it arrived (YYYY-MM-DD)'), kind: 'text', required: true },
                        { name: 'note', label: tx('Note (optional)'), kind: 'textarea' },
                      ]}
                    />
                    <AdminForm
                      endpoint={`/api/admin/payments/${a.id}`}
                      fixed={{ action: 'reject' }}
                      openLabel={tx('Not received')}
                      submit={tx('Reject')}
                      tone="line"
                      fields={[{ ...why(tx), label: tx('Why (the buyer sees it)') }]}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="glass card sob-sec" data-refunds>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Refunds ({length})'} v={{ length: refunds.length }} />
            </h2>
            <p className="tag">
              <T s={'Approve, send the money back by the same route, then record the reference. Nothing is refunded automatically.'} />
            </p>
          </div>
        </div>
        {refunds.length === 0 && (
          <p className="muted">
            <T s={'No refunds waiting.'} />
          </p>
        )}
        <ul className="sob-list">
          {refunds.map((r) => (
            <li key={r.id}>
              <div className="sob-grow">
                <b>
                  <T s={'{v0} to the buyer of {v1} ({kind})'} v={{ v0: usd(r.amountCents), v1: orders.get(r.orderId)?.title ?? 'an order', kind: r.kind }} />
                </b>
                <small>
                  {r.status} · {r.reason}
                </small>
                <div className="sob-acts">
                  {r.status === 'requested' && (
                    <AdminForm endpoint={`/api/admin/refunds/${r.id}`} fixed={{ action: 'approve' }} fields={[]} openLabel={tx('Approve')} submit={tx('Approve refund')} tone="blue" />
                  )}
                  {r.status === 'approved' && (
                    <AdminForm
                      endpoint={`/api/admin/refunds/${r.id}`}
                      fixed={{ action: 'paid' }}
                      openLabel={tx('Record as paid')}
                      submit={tx('Record')}
                      tone="blue"
                      fields={[
                        { name: 'method', label: tx('How the money was sent back'), kind: 'text', required: true },
                        { name: 'reference', label: tx('Reference of the refund payment'), kind: 'text', required: true },
                      ]}
                    />
                  )}
                  {r.status === 'requested' && (
                    <AdminForm endpoint={`/api/admin/refunds/${r.id}`} fixed={{ action: 'cancel' }} fields={[why(tx)]} openLabel={tx('Cancel')} submit={tx('Cancel refund')} tone="line" />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Refund a paid order'} />
            </h2>
            <p className="tag">
              <T s={'For an order that is paid but not yet accepted. Delivered orders go through Disputes.'} />
            </p>
          </div>
        </div>
        <AdminForm
          endpoint="/api/admin/orders/refund-by-id"
          openLabel={tx('Refund an order')}
          submit={tx('Refund')}
          tone="line"
          fields={[{ name: 'orderId', label: tx('Order id'), kind: 'text', required: true }, why(tx)]}
        />
      </div>

      <div className="glass card sob-sec" data-methods>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Payment methods'} />
            </h2>
            <p className="tag">
              <T s={'What buyers see on their payment page. Only add banks and wallets SellOnBay is confirmed eligible to use (blocker B-1).'} />
            </p>
          </div>
        </div>
        <ul className="sob-list">
          {methods.map((m) => (
            <li key={m.id}>
              <div className="sob-grow">
                <b>
                  {m.label} ({m.kind.replace('_', ' ')}, {m.currency}) · {m.active ? tx('shown to buyers') : 'hidden'}
                </b>
                <small style={{ whiteSpace: 'pre-wrap' }}>{m.instructions}</small>
                <AdminForm
                  endpoint="/api/admin/payments/methods"
                  fixed={{ id: m.id, kind: m.kind }}
                  openLabel={tx('Change')}
                  submit={tx('Save')}
                  tone="line"
                  fields={[
                    { name: 'label', label: tx('Name'), kind: 'text', value: m.label, required: true },
                    { name: 'instructions', label: tx('Instructions buyers see'), kind: 'textarea', value: m.instructions, required: true },
                    { name: 'currency', label: tx('Currency'), kind: 'text', value: m.currency, required: true },
                    {
                      name: 'active',
                      label: tx('Shown to buyers'),
                      kind: 'select',
                      options: [
                        ['off', 'Hidden'],
                        ['on', 'Shown'],
                      ],
                    },
                    why(tx),
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
        <AdminForm
          endpoint="/api/admin/payments/methods"
          openLabel={tx('Add a method')}
          submit={tx('Add')}
          tone="blue"
          fields={[
            {
              name: 'kind',
              label: tx('Kind'),
              kind: 'select',
              options: [
                ['bank_transfer', tx('Business bank transfer')],
                ['local_wallet', tx('Local wallet')],
              ],
            },
            { name: 'label', label: tx('Name'), kind: 'text', required: true },
            { name: 'instructions', label: tx('Instructions buyers see (account details)'), kind: 'textarea', required: true },
            { name: 'currency', label: tx('Currency'), kind: 'text', value: 'USD', required: true },
            {
              name: 'active',
              label: tx('Shown to buyers'),
              kind: 'select',
              options: [
                ['off', tx('Hidden for now')],
                ['on', 'Shown'],
              ],
            },
            why(tx),
          ]}
        />
      </div>
    </DashShell>
  );
}
