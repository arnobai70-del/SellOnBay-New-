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

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Orders and payments'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* The design's status tabs, with the order states each one holds. */
const TABS = (tx: Tx): [key: string, label: string, states: OrderState[] | null][] => [
  ['all', tx('All'), null],
  ['check', tx('Payment check'), ['awaiting_payment', 'payment_review', 'beta_requested']],
  ['escrow', tx('In escrow'), ['funded', 'release_pending', 'in_delivery', 'delivered', 'disputed', 'fix_requested', 'overdue']],
  ['done', tx('Completed'), ['accepted', 'payout_pending', 'paid_out', 'beta_approved']],
  ['refunded', tx('Refunded'), ['refunded', 'cancelled', 'beta_declined']],
];
const why = (tx: Tx) => ({ name: 'reason', label: tx('Why (goes in the audit log)'), kind: 'textarea' as const, required: true });
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;

/*
 * design-reference/admin-orders.html: every order with its payment and escrow state, the POS desk, and payments to verify. In the free beta the
 * requests to approve or decline sit with the payments, as they replace them. Refunds and the refund of a paid order (the old payments tool) follow.
 */
export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tx, translate } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/orders', roles: ['admin'], scope: ['delivery', 'support', 'finance'] });
  const sp = await searchParams;
  const tab = TABS(tx).find(([k]) => k === sp.tab) ?? TABS(tx)[0];
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
    <AdminShell viewer={viewer} active="orders" file="admin-orders" title={tx('Orders & payments')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Orders & payments'} />
          </h1>
          <div className="tag">{beta_ ? tx('Free beta: nothing is charged. Approve a request to release its files.') : tx('Every website and domain order, its payment and its escrow state')}</div>
        </div>
        <Link className="btn ghost" href="/admin/reports" prefetch={false}>
          <T s={'Export orders'} />
        </Link>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Orders this month'} />
          </div>
          <div className="v">{month.length}</div>
          <div className="s">
            {month.filter((o) => !o.domain).length} <T s={'websites ·'} /> {month.filter((o) => o.domain).length} <T s={'with a domain'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Awaiting payment check'} />
          </div>
          <div className="v">{attempts.length + waiting.length}</div>
          <div className="s">{beta_ ? `${waiting.length} free beta requests` : tx('Manual methods')}</div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'In escrow review'} />
          </div>
          <div className="v">{inReview.length}</div>
          <div className="s">
            {usd(inReview.reduce((s, o) => s + (o.fundedAt ? o.priceCents - o.refundedCents : 0), 0))} <T s={'held'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Refunded'} />
          </div>
          <div className="v">{refundedMonth.length}</div>
          <div className="s">
            {usd(refundedMonth.reduce((s, o) => s + o.refundedCents, 0))} <T s={'this month'} />
          </div>
        </div>
      </div>

      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 8px' }}>
          <div className="seg" role="tablist" aria-label={tx('Order status')}>
            {TABS(tx).map(([k, l]) => (
              <Link key={k} role="tab" className={k === tab[0] ? 'on' : ''} aria-selected={k === tab[0]} href={k === 'all' ? '/admin/orders' : `/admin/orders?tab=${k}`} prefetch={false}>
                {l}
              </Link>
            ))}
          </div>
          <form action="/admin/orders" method="get" role="search" style={{ maxWidth: 280, width: '100%' }}>
            {tab[0] !== 'all' && <input type="hidden" name="tab" value={tab[0]} />}
            <label htmlFor="of" className="hidden-label">
              <T s={'Filter orders'} />
            </label>
            <input id="of" name="q" defaultValue={sp.q ?? ''} className="input" placeholder={tx('Filter by order, buyer or seller')} style={{ maxWidth: 280, borderRadius: 999 }} />
          </form>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>
                  <T s={'Order'} />
                </th>
                <th>
                  <T s={'Item'} />
                </th>
                <th>
                  <T s={'Buyer'} />
                </th>
                <th>
                  <T s={'Seller'} />
                </th>
                <th>
                  <T s={'Method'} />
                </th>
                <th>
                  <T s={'Amount'} />
                </th>
                <th>
                  <T s={'Status'} />
                </th>
                <th>
                  <T s={'Escrow'} />
                </th>
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
                        <div className="tag">{o.domain ? tx('Website · {name}', { name: o.domain.name }) : tx('Website')}</div>
                      </td>
                      <td>{names.get(o.buyerId ?? '') ?? '—'}</td>
                      <td>{names.get(o.sellerId ?? '') ?? (o.sellerId ? '—' : 'SellOnBay')}</td>
                      <td>{o.payment?.ref === 'subscription' ? tx('Subscription') : o.state.startsWith('beta_') ? tx('Free beta') : (o.payment?.brand ?? (o.demo ? tx('Test card') : '—'))}</td>
                      <td>{usd(o.priceCents)}</td>
                      <td>
                        <span className={`status ${TONE[s.tone]}`}>{translate(s.label)}</span>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        {review !== null && review > 0 ? (
                          <>
                            <div className="tag" style={{ margin: '0 0 6px' }}>
                              <T s={'{v0}h left'} v={{ v0: Math.round(review / 3_600_000) }} />
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
                    {q ? tx('No order matches that filter.') : tx('No orders in the last 30 days.')}
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
            <h2>{beta_ ? tx('Requests and payments to verify') : tx('Payments to verify')}</h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Match the reference with your bank or wallet statement'} />
            </span>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Order'} />
                  </th>
                  <th>
                    <T s={'Method'} />
                  </th>
                  <th>
                    <T s={'Reference'} />
                  </th>
                  <th>
                    <T s={'Amount'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                  <th>
                    <span className="hidden-label">
                      <T s={'Actions'} />
                    </span>
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
                      <td>
                        <T s={'Free beta'} />
                      </td>
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
                        <span className="status st-wait">
                          <T s={'Pending'} />
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <ActionButton endpoint={`/api/admin/beta/${r.orderId}`} label={tx('Approve')} body={{ decision: 'approve' }} />
                          <ActionButton
                            endpoint={`/api/admin/beta/${r.orderId}`}
                            label={tx('Decline')}
                            tone="line"
                            body={{ decision: 'decline' }}
                            note={{ label: tx('Reason for the buyer'), required: true }}
                          />
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
                          <T s={'{v0} · due {v1}'} v={{ v0: plainWords(o?.title ?? 'Order'), v1: o ? usd(o.priceCents) : '?' }} />
                        </div>
                      </td>
                      <td>{methodName.get(a.methodId ?? '') ?? tx('Transfer')}</td>
                      <td>
                        <T s={'Ref {reference}'} v={{ reference: a.reference }} />
                        <div className="tag">
                          <T s={'Paid on {paidOn} · reported {v1}'} v={{ paidOn: a.paidOn, v1: when(a.createdAt) }} />
                        </div>
                        {a.proofPath ? (
                          <a className="tag" style={{ display: 'block' }} href={`/api/admin/payments/${a.id}/proof`} target="_blank" rel="noopener noreferrer">
                            <T s={'Open the proof (logged)'} />
                          </a>
                        ) : (
                          <div className="tag">
                            <T s={'No proof attached.'} />
                          </div>
                        )}
                      </td>
                      <td>
                        {usd(a.amountClaimedCents)} {a.currency}
                      </td>
                      <td>
                        <span className="status st-wait">
                          <T s={'Pending'} />
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', textAlign: 'left' }}>
                          <AdminForm
                            endpoint={`/api/admin/payments/${a.id}`}
                            fixed={{ action: 'reconcile' }}
                            openLabel={tx('Verify')}
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
                            openLabel={tx('Reject')}
                            submit={tx('Reject')}
                            tone="line"
                            fields={[{ ...why(tx), label: tx('Why (the buyer sees it)') }]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!waiting.length && !attempts.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      <T s={"Nothing to verify. A buyer's report or screenshot is never proof: check it against the statement."} />
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
            <h2>
              <T s={'Decided requests'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={"With the buyer's feedback"} />
            </span>
          </div>
          {decided.map((r) => {
            const f = feedback.find((x) => x.orderId === r.orderId);
            return (
              <div key={r.orderId} className="li" style={{ alignItems: 'flex-start' }}>
                <span className={r.declineReason ? 'status st-bad' : 'status st-ok'}>{r.declineReason ? tx('Declined') : tx('Approved')}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  <Link href={`/admin/orders/${r.orderId}`} prefetch={false}>
                    {plainWords(byId.get(r.orderId)?.title ?? r.productKey)}
                  </Link>{' '}
                  <span className="muted">
                    · {r.name} · {r.email}
                  </span>
                  {r.declineReason && (
                    <div className="tag">
                      <T s={'Reason: {declineReason}'} v={{ declineReason: r.declineReason }} />
                    </div>
                  )}
                  {f && (
                    <div className="tag">
                      <T s={'Feedback: {rating} of 5.{v1}{v2}'} v={{ rating: f.rating, v1: f.worked ? ` Worked: ${f.worked}.` : '', v2: f.improve ? ` Improve: ${f.improve}.` : '' }} />
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
            <h2>
              <T s={'Refunds ({length})'} v={{ length: refunds.length }} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Send the money back by the same route, then record it'} />
            </span>
          </div>
          {refunds.length ? (
            refunds.map((r) => (
              <div key={r.id} className="li" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span className={r.status === 'approved' ? 'status st-info' : 'status st-wait'}>{r.status === 'approved' ? tx('Approved') : tx('Requested')}</span>
                <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 14 }}>
                  <T s={'{v0} to the buyer of {v1} ({kind})'} v={{ v0: usd(r.amountCents), v1: plainWords(byId.get(r.orderId)?.title ?? 'an order'), kind: r.kind }} />
                  <div className="tag">{r.reason}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            ))
          ) : (
            <p className="muted" style={{ fontSize: 14, margin: '8px 0 0' }}>
              <T s={'No refunds waiting. Nothing is refunded automatically.'} />
            </p>
          )}
        </section>
        <section className="glass card">
          <h2>
            <T s={'Refund a paid order'} />
          </h2>
          <div className="tag">
            <T s={'For an order that is paid but not yet accepted. Delivered orders go through Disputes.'} />
          </div>
          <AdminForm
            endpoint="/api/admin/orders/refund-by-id"
            openLabel={tx('Refund an order')}
            submit={tx('Refund')}
            tone="line"
            fields={[{ name: 'orderId', label: tx('Order id'), kind: 'text', required: true }, why(tx)]}
          />
        </section>
      </div>
    </AdminShell>
  );
}
