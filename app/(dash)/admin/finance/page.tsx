import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { AdminShell } from '@/components/glass/AdminShell';
import { auditList } from '@/lib/admin/audit';
import { DAY_MS, PAYOUT_TEXT, PLAN_FEE_TEXT, PLAN_KEEP_TEXT } from '@/lib/config';
import { verificationOf } from '@/lib/glass/admin';
import { usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { acct } from '@/lib/ledger';
import { ledgerStore } from '@/lib/ledgerStore';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { listRefunds } from '@/lib/payments/store';
import { listPayouts } from '@/lib/payouts';
import { paypalConfigured } from '@/lib/providers/payment';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Finance and payouts', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['payouts', 'Payouts'],
  ['ledger', 'Ledger'],
  ['refunds', 'Refunds'],
  ['reconciliation', 'Reconciliation'],
] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/*
 * design-reference/admin-finance.html, from the double-entry ledger (lib/ledger.ts) and the weekly payouts (lib/payouts.ts). The payout queue
 * keeps every action of the payouts tool: the CSV for a week, Mark paid with the transfer reference, Failed, and PayPal send and check. Beta
 * orders are $0 and never touch the ledger.
 */
export default async function AdminFinance({ searchParams }: { searchParams: Promise<{ tab?: string; from?: string; to?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/finance', roles: ['admin'], scope: 'finance' });
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'payouts';
  const now = Date.now();
  const to = DAY.test(sp.to ?? '') ? sp.to! : iso(now);
  const from = DAY.test(sp.from ?? '') ? sp.from! : iso(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1));
  const fromMs = Date.parse(from + 'T00:00:00Z');
  const toMs = Date.parse(to + 'T00:00:00Z') + DAY_MS;
  const L = await ledgerStore();
  const sum = async (prefix: string) => (await L.balances(prefix)).reduce((s, b) => s + Math.max(0, b.holds), 0);
  const [escrow, pending, available, reserve, debt, held, refundDue, revenue, payouts, orders, refunds, log] = await Promise.all([
    sum('order_escrow:'),
    sum('seller_pending:'),
    sum('seller_available:'),
    sum('seller_reserve:'),
    sum('seller_debt:'),
    sum('buyer_payment_held:'),
    sum('buyer_refund_due:'),
    L.balance(acct.revenue),
    listPayouts({}),
    (async () => (await orderStore()).changedSince(fromMs))(),
    listRefunds({}),
    auditList(200),
  ]);
  const paypal = paypalConfigured();
  const toSend = payouts.filter((p) => p.status === 'scheduled' || p.status === 'exported');
  const nid = await verificationOf(toSend.map((p) => p.sellerId));
  const cashIn = orders.filter((o) => o.fundedAt && o.fundedAt >= fromMs && o.fundedAt < toMs).reduce((s, o) => s + o.priceCents, 0);
  const paidOut = payouts.filter((p) => p.paidAt && p.paidAt >= fromMs && p.paidAt < toMs).reduce((s, p) => s + p.amountCents, 0);
  const refunded = refunds.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.paidAt && r.paidAt >= fromMs && r.paidAt < toMs ? r.amountCents : 0), 0);
  const owed = pending + available + reserve;
  const total = Math.max(1, escrow + owed + revenue);
  const share = (n: number) => `${Math.round((n / total) * 100)}%`;
  const lastPay = log.find((a) => a.action.startsWith('payout_') || a.action.startsWith('payment_'));
  const weeks = [...new Set(toSend.filter((p) => p.status === 'scheduled').map((p) => p.weekStart))];
  const query = (t: string) => `/admin/finance?${new URLSearchParams({ ...(t !== 'payouts' ? { tab: t } : {}), ...(sp.from ? { from } : {}), ...(sp.to ? { to } : {}) })}`;
  const lines: [string, number][] = [
    ['Buyer money in escrow', escrow],
    ['Sellers, on the 7-day hold', pending],
    ['Sellers, available for payout', available],
    ['Sellers, reserve', reserve],
    ['Owed by sellers after refunds', debt],
    ['Reported payments held, not matched to an order yet', held],
    ['Refunds owed to buyers', refundDue],
    ['Platform revenue', revenue],
  ];
  return (
    <AdminShell viewer={viewer} active="finance" file="admin-finance" title={tx('Finance & payouts')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Finance & payouts'} />
          </h1>
          <div className="tag">
            <T s={'Double-entry ledger, escrow balance, seller payouts and reconciliation · fee {PLAN_FEE_TEXT} · {PAYOUT_TEXT}'} v={{ PLAN_FEE_TEXT, PAYOUT_TEXT }} />
          </div>
        </div>
        <form action="/admin/finance" method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {tab !== 'payouts' && <input type="hidden" name="tab" value={tab} />}
          <label htmlFor="fr" className="hidden-label">
            <T s={'From'} />
          </label>
          <input id="fr" name="from" className="input" type="date" defaultValue={from} style={{ width: 'auto' }} />{' '}
          <label htmlFor="to" className="hidden-label">
            <T s={'To'} />
          </label>
          <input id="to" name="to" className="input" type="date" defaultValue={to} style={{ width: 'auto' }} />{' '}
          <button className="btn ghost" type="submit">
            <T s={'Apply'} />
          </button>
        </form>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Cash in'} />
          </div>
          <div className="v">{usd(cashIn)}</div>
          <div className="s">
            <T s={'Paid orders in these dates'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Cash out'} />
          </div>
          <div className="v">{usd(paidOut + refunded)}</div>
          <div className="s">
            <T s={'Payouts + refunds'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Held in escrow'} />
          </div>
          <div className="v">{usd(escrow)}</div>
          <div className="s">
            <T s={'Not yet earned'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Owed to sellers'} />
          </div>
          <div className="v">{usd(owed)}</div>
          <div className="s">
            <T s={'{v0} ready for Thursday'} v={{ v0: usd(available) }} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Platform income'} />
          </div>
          <div className="v">{usd(revenue)}</div>
          <div className="s">
            <T s={'{PLAN_FEE_TEXT} share + domains'} v={{ PLAN_FEE_TEXT }} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Reconciliation'} />
          </div>
          <div className="v">{usd(held)}</div>
          <div className="s">
            {held ? (
              <span className="status st-wait">
                <T s={'To match'} />
              </span>
            ) : (
              <span className="status st-ok">
                <T s={'Match'} />
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="seg" role="tablist" aria-label={tx('Finance section')} style={{ alignSelf: 'flex-start' }}>
        {TABS.map(([k, l]) => (
          <Link key={k} role="tab" className={k === tab ? 'on' : ''} aria-selected={k === tab} href={query(k)} prefetch={false}>
            {l}
          </Link>
        ))}
      </div>

      {tab === 'payouts' && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <div>
              <h2>
                <T s={'Payout queue'} />
              </h2>
              <div className="tag">
                <T s={"Only sellers with a verified identity and payout method can be paid. Download a week's CSV, send, then mark each one paid."} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {weeks.length ? (
                weeks.map((w) => (
                  <form key={w} method="post" action={`/api/admin/payouts/csv?week=${w}`}>
                    <button type="submit" className="btn">
                      <T s={'Pay all ready · CSV {w}'} v={{ w }} />
                    </button>
                  </form>
                ))
              ) : (
                <Link className="btn ghost" href="/admin/finance/payouts" prefetch={false}>
                  <T s={'Every payout'} />
                </Link>
              )}
            </div>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Seller'} />
                  </th>
                  <th>
                    <T s={'Orders'} />
                  </th>
                  <th>
                    <T s={'Earned ({PLAN_KEEP_TEXT})'} v={{ PLAN_KEEP_TEXT }} />
                  </th>
                  <th>
                    <T s={'Method'} />
                  </th>
                  <th>
                    <T s={'Identity'} />
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
                {toSend.length ? (
                  toSend.map((p) => {
                    const id = nid.get(p.sellerId);
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500 }}>
                          {p.sellerName}
                          <div className="tag">
                            <T s={'Payout day {weekStart}'} v={{ weekStart: p.weekStart }} />
                          </div>
                        </td>
                        <td>{p.orderIds.length}</td>
                        <td>{usd(p.amountCents)}</td>
                        <td>{p.method || tx('Not set')}</td>
                        <td>
                          <span className={`status ${id === 'approved' ? 'st-ok' : id === 'rejected' ? 'st-bad' : 'st-wait'}`}>
                            {id === 'approved' ? tx('Verified') : id === 'rejected' ? tx('Rejected') : id ? tx('Pending') : tx('Not sent')}
                          </span>
                        </td>
                        <td>
                          <span className={`status ${p.status === 'exported' ? 'st-wait' : 'st-info'}`}>{p.status === 'exported' ? tx('Being sent') : tx('Ready')}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', textAlign: 'left' }}>
                            {paypal && p.method === 'paypal' && !p.reference?.startsWith('paypal:') && (
                              <AdminForm
                                endpoint={`/api/admin/payouts/${p.id}/paypal`}
                                fixed={{ action: 'send' }}
                                fields={[]}
                                openLabel="Pay now"
                                submit={`Send ${usd(p.amountCents)} to ${p.account}`}
                                tone="blue"
                              />
                            )}
                            {paypal && p.status === 'exported' && p.reference?.startsWith('paypal:') && (
                              <AdminForm endpoint={`/api/admin/payouts/${p.id}/paypal`} fixed={{ action: 'check' }} fields={[]} openLabel="Check PayPal" submit="Ask PayPal now" tone="line" />
                            )}
                            {p.status === 'exported' && !p.reference?.startsWith('paypal:') && (
                              <>
                                <AdminForm
                                  endpoint={`/api/admin/payouts/${p.id}/paid`}
                                  openLabel="Mark paid"
                                  submit="I sent it"
                                  tone="blue"
                                  fields={[{ name: 'reference', label: 'Transfer reference from Wise, Payoneer or the bank', kind: 'text', required: true }]}
                                />
                                <AdminForm
                                  endpoint={`/api/admin/payouts/${p.id}/fail`}
                                  openLabel="Failed"
                                  submit="Mark failed"
                                  tone="line"
                                  fields={[{ name: 'note', label: 'What went wrong', kind: 'textarea' }]}
                                />
                              </>
                            )}
                            {p.status === 'scheduled' && !(paypal && p.method === 'paypal') && (
                              <span className="tag" style={{ margin: 0 }}>
                                <T s={'Download the CSV first'} />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="muted">
                      <T s={'No payouts waiting. {PAYOUT_TEXT}.'} v={{ PAYOUT_TEXT }} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(tab === 'ledger' || tab === 'reconciliation') && (
        <section className="glass card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>{tab === 'ledger' ? tx('Ledger balances') : tx('Reconciliation')}</h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Check each line against the bank, wallet and provider statements'} />
            </span>
          </div>
          {lines.map(([label, n]) => (
            <div key={label} className="li" style={{ fontSize: 14 }}>
              <span style={{ flex: 1 }}>{label}</span>
              <b style={{ fontWeight: 500 }}>{usd(n)}</b>
            </div>
          ))}
          {tab === 'reconciliation' && (
            <div className="li" style={{ fontSize: 14 }}>
              <span style={{ flex: 1 }}>
                <T s={'Reported payments to match'} />
              </span>
              <Link className="btn sm ghost" href="/admin/orders" prefetch={false}>
                <T s={'Payments to verify'} />
              </Link>
            </div>
          )}
        </section>
      )}

      {tab === 'refunds' && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>
              <T s={'Refunds'} />
            </h2>
            <Link className="btn sm ghost" href="/admin/orders#refunds" prefetch={false}>
              <T s={'Approve or record refunds'} />
            </Link>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Order'} />
                  </th>
                  <th>
                    <T s={'Amount'} />
                  </th>
                  <th>
                    <T s={'Kind'} />
                  </th>
                  <th>
                    <T s={'Reason'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {refunds.length ? (
                  refunds.slice(0, 100).map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{orderCode(r.orderId)}</td>
                      <td>{usd(r.amountCents)}</td>
                      <td>{r.kind}</td>
                      <td>{plainWords(r.reason)}</td>
                      <td>
                        <span className={`status ${r.status === 'paid' ? 'st-ok' : r.status === 'cancelled' ? 'st-draft' : 'st-wait'}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">
                      <T s={'No refunds.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid2">
        <section className="glass card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2>
              <T s={'Where the money is'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'From the ledger'} />
            </span>
          </div>
          <div
            style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', margin: '10px 0 14px', background: '#E1EAEF' }}
            role="img"
            aria-label={`Escrow ${share(escrow)}, owed to sellers ${share(owed)}, platform income ${share(revenue)}`}
          >
            <span style={{ width: share(escrow), background: '#9FC9E3' }} />
            <span style={{ width: share(owed), background: '#7FBFA9' }} />
            <span style={{ width: share(revenue), background: '#B9B0E0' }} />
          </div>
          {(
            [
              ['#9FC9E3', 'Held in escrow', escrow],
              ['#7FBFA9', 'Owed to sellers', owed],
              ['#B9B0E0', 'Platform income', revenue],
            ] as const
          ).map(([c, l, n]) => (
            <div key={l} className="li" style={{ fontSize: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
              <span style={{ flex: 1 }}>{l}</span>
              <span>{usd(n)}</span>
            </div>
          ))}
        </section>
        <section className="glass card">
          <h2>
            <T s={'Audit'} />
          </h2>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Ledger entries'} />
            </span>
            <span className="status st-ok">
              <T s={'Keyed, never below zero'} />
            </span>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Last payment action'} />
            </span>
            <span className="muted">{lastPay ? `${when(lastPay.at)} · ${lastPay.action.replace(/_/g, ' ')}` : tx('None yet')}</span>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Edits to posted entries'} />
            </span>
            <span className="muted">
              <T s={'Not allowed · reverse instead'} />
            </span>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Export for accountant'} />
            </span>
            <Link className="btn sm ghost" href="/admin/reports" prefetch={false}>
              <T s={'Sales PDF'} />
            </Link>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Every payout, by week and method'} />
            </span>
            <Link className="btn sm ghost" href="/admin/finance/payouts" prefetch={false}>
              <T s={'Open'} />
            </Link>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
