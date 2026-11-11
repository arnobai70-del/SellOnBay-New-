import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { PosForm } from '@/components/glass/PosForm';
import { allBetaFeedback, betaRequests } from '@/lib/beta/service';
import { getLiveDbProducts } from '@/lib/catalog';
import { CONFIG, DAY_MS, REVIEW_HOURS } from '@/lib/config';
import { profileNames } from '@/lib/glass/admin';
import { buyerStatus, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import type { Order, OrderState } from '@/lib/orders/machine';
import { getOrder } from '@/lib/orders/service';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { listAttempts, listMethods, listRefunds } from '@/lib/payments/store';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Orders and payments', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* The design's status tabs, with the order states each one holds. */
const TABS: [key: string, label: string, states: OrderState[] | null][] = [
  ['all', 'All', null],
  ['check', 'Payment check', ['awaiting_payment', 'payment_review', 'beta_requested']],
  ['escrow', 'In escrow', ['funded', 'release_pending', 'in_delivery', 'delivered', 'disputed', 'fix_requested', 'overdue']],
  ['done', 'Completed', ['accepted', 'payout_pending', 'paid_out', 'beta_approved']],
  ['refunded', 'Refunded', ['refunded', 'cancelled', 'beta_declined']],
];
const why = { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea' as const, required: true };
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;

/*
 * design-reference/admin-orders.html: every order with its payment and escrow state, the POS desk, and payments to verify. In the free beta the
 * requests to approve or decline sit with the payments, as they replace them. Refunds and the refund of a paid order (the old payments tool) follow.
 */
export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/orders', roles: ['admin'], scope: ['delivery', 'support', 'finance'] });
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab) ?? TABS[0];
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 80);
  const now = Date.now();
  const monthFrom = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const [settings, recent, attempts, methods, refunds, beta, feedback, live] = await Promise.all([
    getSettings(),
    (async () => (await orderStore()).changedSince(now - 30 * DAY_MS))(),
    listAttempts(['submitted']),
    listMethods(),
    listRefunds({ statuses: ['requested', 'approved'] }),
    betaRequests(),
    allBetaFeedback(),
    getLiveDbProducts('web').catch(() => []),
  ]);
  const ids = [...new Set([...attempts.map((a) => a.orderId), ...refunds.map((r) => r.orderId), ...beta.slice(0, 100).map((r) => r.orderId)])];
  const extra = new Map(await Promise.all(ids.filter((id) => !recent.some((o) => o.id === id)).map(async (id) => [id, await getOrder(id)] as const)));
  const byId = new Map<string, Order | null>([...recent.map((o) => [o.id, o] as const), ...extra]);
  const names = await profileNames(recent.flatMap((o) => [o.buyerId, o.sellerId]));
  const methodName = new Map(methods.map((m) => [m.id, m.label]));
  const month = recent.filter((o) => o.createdAt >= monthFrom);
  const inReview = recent.filter((o) => o.state === 'delivered');
  const refundedMonth = month.filter((o) => o.refundedCents > 0 || o.state === 'refunded');
  const rows = recent
    .filter((o) => !tab[2] || tab[2].includes(o.state))
    .filter((o) => !q || [o.id, orderCode(o.id), o.title, names.get(o.buyerId ?? ''), names.get(o.sellerId ?? '')].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 200);
  const waiting = beta.filter((r) => !r.decidedAt).slice(0, 100);
  const decided = beta.filter((r) => r.decidedAt).slice(0, 50);
  const beta_ = settings.paymentsMode === 'beta_free';
  return (
    <AdminShell viewer={viewer} active="orders" file="admin-orders" title="Orders & payments" head={false}>
      <div className="row">
        <div>
          <h1>Orders &amp; payments</h1>
          <div className="tag">{beta_ ? 'Free beta: nothing is charged. Approve a request to release its files.' : 'Every website and domain order, its payment and its escrow state'}</div>
        </div>
        <Link className="btn ghost" href="/admin/reports" prefetch={false}>
          Export orders
        </Link>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">Orders this month</div>
          <div className="v">{month.length}</div>
          <div className="s">
            {month.filter((o) => !o.domain).length} websites · {month.filter((o) => o.domain).length} with a domain
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">Awaiting payment check</div>
          <div className="v">{attempts.length + waiting.length}</div>
          <div className="s">{beta_ ? `${waiting.length} free beta requests` : 'Manual methods'}</div>
        </div>
        <div className="glass kpi">
          <div className="l">In escrow review</div>
          <div className="v">{inReview.length}</div>
          <div className="s">{usd(inReview.reduce((s, o) => s + (o.fundedAt ? o.priceCents - o.refundedCents : 0), 0))} held</div>
        </div>
        <div className="glass kpi">
          <div className="l">Refunded</div>
          <div className="v">{refundedMonth.length}</div>
          <div className="s">{usd(refundedMonth.reduce((s, o) => s + o.refundedCents, 0))} this month</div>
        </div>
      </div>

      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 8px' }}>
          <div className="seg" role="tablist" aria-label="Order status">
            {TABS.map(([k, l]) => (
              <Link key={k} role="tab" className={k === tab[0] ? 'on' : ''} aria-selected={k === tab[0]} href={k === 'all' ? '/admin/orders' : `/admin/orders?tab=${k}`} prefetch={false}>
                {l}
              </Link>
            ))}
          </div>
          <form action="/admin/orders" method="get" role="search" style={{ maxWidth: 280, width: '100%' }}>
            {tab[0] !== 'all' && <input type="hidden" name="tab" value={tab[0]} />}
            <label htmlFor="of" className="hidden-label">
              Filter orders
            </label>
            <input id="of" name="q" defaultValue={sp.q ?? ''} className="input" placeholder="Filter by order, buyer or seller" style={{ maxWidth: 280, borderRadius: 999 }} />
          </form>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Escrow</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((o) => {
                  const s = buyerStatus(o.state);
                  const review = o.state === 'delivered' && o.reviewEndsAt ? o.reviewEndsAt - now : null;
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/admin/orders/${o.id}`} prefetch={false}>
                          {orderCode(o.id)}
                        </Link>
                      </td>
                      <td>
                        {plainWords(o.title)}
                        <div className="tag">{o.domain ? `Website · ${o.domain.name}` : 'Website'}</div>
                      </td>
                      <td>{names.get(o.buyerId ?? '') ?? '—'}</td>
                      <td>{names.get(o.sellerId ?? '') ?? (o.sellerId ? '—' : 'SellOnBay')}</td>
                      <td>{o.payment?.ref === 'subscription' ? 'Subscription' : o.state.startsWith('beta_') ? 'Free beta' : (o.payment?.brand ?? (o.demo ? 'Test card' : '—'))}</td>
                      <td>{usd(o.priceCents)}</td>
                      <td>
                        <span className={`status ${TONE[s.tone]}`}>{s.label}</span>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        {review !== null && review > 0 ? (
                          <>
                            <div className="tag" style={{ margin: '0 0 6px' }}>
                              {Math.round(review / 3_600_000)}h left
                            </div>
                            <div className="bar">
                              <i style={{ width: `${Math.round(Math.min(1, Math.max(0, 1 - review / (REVIEW_HOURS * 3_600_000))) * 100)}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className="tag" style={{ margin: 0 }}>
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="muted">
                    {q ? 'No order matches that filter.' : 'No orders in the last 30 days.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div id="pos" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', scrollMarginTop: 90 }}>
        <PosForm
          open={settings.paymentsMode === 'live'}
          keepBps={10_000 - CONFIG.flatPlan.commissionBps}
          reviewHours={REVIEW_HOURS}
          items={live.slice(0, 200).map((p) => ({ key: p.id, name: plainWords(p.name), priceCents: Math.round(p.price * 100) }))}
        />
        <section className="glass" style={{ flex: '999 1 440px', minWidth: 0, padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>{beta_ ? 'Requests and payments to verify' : 'Payments to verify'}</h2>
            <span className="tag" style={{ margin: 0 }}>
              Match the reference with your bank or wallet statement
            </span>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>
                    <span className="hidden-label">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((r) => {
                  const o = byId.get(r.orderId);
                  return (
                    <tr key={r.orderId}>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/admin/orders/${r.orderId}`} prefetch={false}>
                          {orderCode(r.orderId)}
                        </Link>
                        <div className="tag">{plainWords(o?.title ?? r.productKey)}</div>
                      </td>
                      <td>Free beta</td>
                      <td>
                        {r.name} · {r.email}
                        <div className="tag">
                          {r.country}
                          {r.company ? ` · ${r.company}` : ''}
                          {r.domain ? ` · domain ${r.domain}` : ''} · {when(r.createdAt)}
                        </div>
                        <div className="tag">{r.useFor}</div>
                      </td>
                      <td>$0</td>
                      <td>
                        <span className="status st-wait">Pending</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label="Approve" body={{ decision: 'approve' }} />
                          <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label="Decline" tone="line" body={{ decision: 'decline' }} note={{ label: 'Reason for the buyer', required: true }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {attempts.map((a) => {
                  const o = byId.get(a.orderId);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>
                        {orderCode(a.orderId)}
                        <div className="tag">
                          {plainWords(o?.title ?? 'Order')} · due {o ? usd(o.priceCents) : '?'}
                        </div>
                      </td>
                      <td>{methodName.get(a.methodId ?? '') ?? 'Transfer'}</td>
                      <td>
                        Ref {a.reference}
                        <div className="tag">
                          Paid on {a.paidOn} · reported {when(a.createdAt)}
                        </div>
                        {a.proofPath ? (
                          <a className="tag" style={{ display: 'block' }} href={`/api/admin/payments/${a.id}/proof`} target="_blank" rel="noopener noreferrer">
                            Open the proof (logged)
                          </a>
                        ) : (
                          <div className="tag">No proof attached.</div>
                        )}
                      </td>
                      <td>
                        {usd(a.amountClaimedCents)} {a.currency}
                      </td>
                      <td>
                        <span className="status st-wait">Pending</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', textAlign: 'left' }}>
                          <AdminForm
                            endpoint={`/api/admin/payments/${a.id}`}
                            fixed={{ action: 'reconcile' }}
                            openLabel="Verify"
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
                            openLabel="Reject"
                            submit="Reject"
                            tone="line"
                            fields={[{ ...why, label: 'Why (the buyer sees it)' }]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!waiting.length && !attempts.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Nothing to verify. A buyer&apos;s report or screenshot is never proof: check it against the statement.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {decided.length > 0 && (
        <section className="glass card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>Decided requests</h2>
            <span className="tag" style={{ margin: 0 }}>
              With the buyer&apos;s feedback
            </span>
          </div>
          {decided.map((r) => {
            const f = feedback.find((x) => x.orderId === r.orderId);
            return (
              <div key={r.orderId} className="li" style={{ alignItems: 'flex-start' }}>
                <span className={r.declineReason ? 'status st-bad' : 'status st-ok'}>{r.declineReason ? 'Declined' : 'Approved'}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  <Link href={`/admin/orders/${r.orderId}`} prefetch={false}>
                    {plainWords(byId.get(r.orderId)?.title ?? r.productKey)}
                  </Link>{' '}
                  <span className="muted">
                    · {r.name} · {r.email}
                  </span>
                  {r.declineReason && <div className="tag">Reason: {r.declineReason}</div>}
                  {f && (
                    <div className="tag">
                      Feedback: {f.rating} of 5.{f.worked ? ` Worked: ${f.worked}.` : ''}
                      {f.improve ? ` Improve: ${f.improve}.` : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="grid2">
        <section className="glass card" id="refunds">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>Refunds ({refunds.length})</h2>
            <span className="tag" style={{ margin: 0 }}>
              Send the money back by the same route, then record it
            </span>
          </div>
          {refunds.length ? (
            refunds.map((r) => (
              <div key={r.id} className="li" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span className={r.status === 'approved' ? 'status st-info' : 'status st-wait'}>{r.status === 'approved' ? 'Approved' : 'Requested'}</span>
                <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 14 }}>
                  {usd(r.amountCents)} to the buyer of {plainWords(byId.get(r.orderId)?.title ?? 'an order')} ({r.kind})<div className="tag">{r.reason}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            ))
          ) : (
            <p className="muted" style={{ fontSize: 14, margin: '8px 0 0' }}>
              No refunds waiting. Nothing is refunded automatically.
            </p>
          )}
        </section>
        <section className="glass card">
          <h2>Refund a paid order</h2>
          <div className="tag">For an order that is paid but not yet accepted. Delivered orders go through Disputes.</div>
          <AdminForm
            endpoint="/api/admin/orders/refund-by-id"
            openLabel="Refund an order"
            submit="Refund"
            tone="line"
            fields={[{ name: 'orderId', label: 'Order id', kind: 'text', required: true }, why]}
          />
        </section>
      </div>
    </AdminShell>
  );
}
