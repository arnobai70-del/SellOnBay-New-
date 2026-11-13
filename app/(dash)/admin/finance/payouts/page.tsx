import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { PlanButton } from '@/components/PlanButton';
import Link from 'next/link';
import { emailsOf, listPayouts, payoutOrders, sellerPayoutMethods, weekStartOf } from '@/lib/payouts';
import { PAYOUT_METHODS } from '@/lib/payoutDetails';
import { paypalConfigured } from '@/lib/providers/payment';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Payouts'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '-');
const METHOD_NAME = Object.fromEntries(PAYOUT_METHODS) as Record<string, string>;
const STATUSES = ['scheduled', 'exported', 'paid', 'failed'] as const;

export default async function Payouts({ searchParams }: { searchParams: Promise<{ method?: string; status?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/finance/payouts', roles: ['admin'], scope: 'finance' });
  const q = await searchParams;
  const method = q.method && q.method in METHOD_NAME ? q.method : '';
  const status = (STATUSES as readonly string[]).includes(q.status ?? '') ? (q.status as string) : '';
  const everything = await listPayouts();
  const all = everything.filter((p) => (!method || p.method === method) && (!status || p.status === status));
  const [methods, emails] = await Promise.all([sellerPayoutMethods(), emailsOf(all.slice(0, 80).map((p) => p.sellerId))]);
  // The orders behind each payout, for the newest 40 only.
  const orders = new Map(await Promise.all(all.slice(0, 40).map(async (p) => [p.id, await payoutOrders(p)] as const)));
  const open = everything.filter((p) => p.status === 'scheduled' || p.status === 'exported');
  const sum = (l: typeof everything) => l.reduce((s, p) => s + p.amountCents, 0);
  const monthAgo = Date.now() - 30 * 86_400_000;
  const paidLately = everything.filter((p) => p.status === 'paid' && (p.paidAt ?? 0) > monthAgo);
  const week = weekStartOf(Date.now());
  const weeks = [...new Set(all.map((p) => p.weekStart))].sort().reverse();
  const paypal = paypalConfigured();
  const toExport = all.filter((p) => p.status === 'scheduled' || p.status === 'exported');
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-payouts" title={tx('Payouts')}>
      <div className="kpis">
        <div className="kpi">
          <small>
            <T s={'Waiting to be sent'} />
          </small>
          <b>{money(sum(open))}</b>
          <em>
            <T s={'{length} payouts'} v={{ length: open.length }} />
          </em>
        </div>
        <div className="kpi">
          <small>
            <T s={'Paid, last 30 days'} />
          </small>
          <b>{money(sum(paidLately))}</b>
          <em>
            <T s={'{length} payouts'} v={{ length: paidLately.length }} />
          </em>
        </div>
        <div className="kpi">
          <small>
            <T s={'Failed'} />
          </small>
          <b>{everything.filter((p) => p.status === 'failed').length}</b>
          <em>
            <T s={'Orders wait for the next batch'} />
          </em>
        </div>
        {PAYOUT_METHODS.map(([m, label]) => (
          <div className="kpi" key={m}>
            <small>
              <T s={'{label}, waiting'} v={{ label }} />
            </small>
            <b>{money(sum(open.filter((p) => p.method === m)))}</b>
            <em>
              {methods.filter((x) => x.method === m).length} <T s={'sellers use it'} />
            </em>
          </div>
        ))}
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Weekly payouts'} />
            </h2>
            <p className="tag">
              <T
                s={
                  'Sellers are paid for orders accepted at least 7 days ago. Make the batch (it also runs every Thursday UTC), download the CSV, send the money with Payoneer, Wise or the bank, then mark each payout paid with the transfer reference. Sellers who chose PayPal can be paid with one click (Send with PayPal), then Check PayPal marks it paid when it arrives. Nothing is sent unless you click.'
                }
              />
            </p>
          </div>
        </div>
        <PlanButton week={week} />
        <div className="sob-acts" aria-label={tx('Filter payouts')}>
          <Link className={'btn sm' + (!method && !status ? '' : ' ghost')} href="/admin/finance/payouts">
            <T s={'All'} />
          </Link>
          {PAYOUT_METHODS.map(([m, label]) => (
            <Link key={m} className={'btn sm' + (method === m ? '' : ' ghost')} href={`/admin/finance/payouts?method=${m}${status ? `&status=${status}` : ''}`}>
              {label}
            </Link>
          ))}
          {STATUSES.map((s) => (
            <Link key={s} className={'btn sm' + (status === s ? '' : ' ghost')} href={`/admin/finance/payouts?status=${s}${method ? `&method=${method}` : ''}`}>
              {s}
            </Link>
          ))}
        </div>
        {toExport.length > 0 && (
          <p>
            <T s={'Waiting weeks:'} />{' '}
            {[...new Set(toExport.map((p) => p.weekStart))].map((w) => (
              <form key={w} method="post" action={`/api/admin/payouts/csv?week=${w}`} style={{ display: 'inline' }}>
                <button type="submit" className="btn sm" style={{ marginRight: 8 }}>
                  <T s={'Download CSV for {w}'} v={{ w }} />
                </button>
              </form>
            ))}
          </p>
        )}
        {all.length === 0 && (
          <p className="muted">
            <T s={'No payouts yet. They appear once an accepted order has passed its 7-day hold.'} />
          </p>
        )}
        {weeks.map((w) => (
          <div key={w} className="tbl">
            <h3 style={{ marginTop: 18 }}>
              <T s={'Week starting {w}'} v={{ w }} />
            </h3>
            <table className="sob-stack">
              <thead>
                <tr>
                  <th>
                    <T s={'Seller'} />
                  </th>
                  <th>
                    <T s={'Method'} />
                  </th>
                  <th>
                    <T s={'Send to'} />
                  </th>
                  <th>
                    <T s={'Amount'} />
                  </th>
                  <th>
                    <T s={'Orders'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                  <th>
                    <T s={'Action'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {all
                  .filter((p) => p.weekStart === w)
                  .map((p) => (
                    <tr key={p.id}>
                      <td data-label={tx('Seller')}>
                        <b>{p.sellerName}</b>
                        {emails.get(p.sellerId) && <small style={{ display: 'block' }}>{emails.get(p.sellerId)}</small>}
                      </td>
                      <td data-label={tx('Method')}>{METHOD_NAME[p.method] ?? p.method}</td>
                      <td data-label={tx('Send to')}>{p.account}</td>
                      <td data-label={tx('Amount')}>
                        <b>{money(p.amountCents)}</b>
                      </td>
                      <td data-label={tx('Orders')}>
                        {p.orderIds.length}
                        {orders.get(p.id)?.length ? (
                          <details>
                            <summary>
                              <T s={'Show'} />
                            </summary>
                            <ul>
                              {orders.get(p.id)!.map((o) => (
                                <li key={o.id}>
                                  {o.title}
                                  {o.cents ? `: ${money(o.cents)}` : ''}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </td>
                      <td data-label={tx('Status')}>
                        {p.status}
                        {p.reference ? ` (${p.reference})` : ''}
                        <small style={{ display: 'block' }}>
                          <T s={'Made {v0}{v1}{v2}'} v={{ v0: day(p.createdAt), v1: p.exportedAt ? `, sent ${day(p.exportedAt)}` : '', v2: p.paidAt ? `, paid ${day(p.paidAt)}` : '' }} />
                        </small>
                      </td>
                      <td data-label={tx('Action')}>
                        {paypal && p.method === 'paypal' && (p.status === 'scheduled' || p.status === 'exported') && !p.reference?.startsWith('paypal:') && (
                          <AdminForm
                            endpoint={`/api/admin/payouts/${p.id}/paypal`}
                            fixed={{ action: 'send' }}
                            fields={[]}
                            openLabel={tx('Send with PayPal')}
                            submit={tx('Send {money} to {account}', { money: money(p.amountCents), account: p.account })}
                            tone="blue"
                          />
                        )}
                        {paypal && p.status === 'exported' && p.reference?.startsWith('paypal:') && (
                          <AdminForm endpoint={`/api/admin/payouts/${p.id}/paypal`} fixed={{ action: 'check' }} fields={[]} openLabel={tx('Check PayPal')} submit={tx('Ask PayPal now')} tone="line" />
                        )}
                        {p.status === 'exported' && !p.reference?.startsWith('paypal:') && (
                          <>
                            <AdminForm
                              endpoint={`/api/admin/payouts/${p.id}/paid`}
                              openLabel={tx('Mark paid')}
                              submit={tx('I sent it')}
                              tone="blue"
                              fields={[{ name: 'reference', label: tx('Transfer reference from Wise, Payoneer or the bank'), kind: 'text', required: true }]}
                            />
                            <AdminForm
                              endpoint={`/api/admin/payouts/${p.id}/fail`}
                              openLabel={tx('Failed')}
                              submit={tx('Mark failed')}
                              tone="line"
                              fields={[{ name: 'note', label: tx('What went wrong'), kind: 'textarea' }]}
                            />
                          </>
                        )}
                        {p.status === 'scheduled' && (
                          <small className="muted">
                            <T s={'Download the CSV first'} />
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="glass card sob-sec" id="methods">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Seller payout methods'} />
            </h2>
            <p className="tag">
              <T s={'Where each seller wants to be paid. When a seller changes it, you are told here and by email. Only you see the full account.'} />
            </p>
          </div>
        </div>
        {methods.length === 0 && (
          <p className="muted">
            <T s={'No seller has saved a payout method yet. Sellers add it on their dashboard.'} />
          </p>
        )}
        {methods.length > 0 && (
          <div className="tbl">
            <table className="sob-stack">
              <thead>
                <tr>
                  <th>
                    <T s={'Seller'} />
                  </th>
                  <th>
                    <T s={'Method'} />
                  </th>
                  <th>
                    <T s={'Account'} />
                  </th>
                  <th>
                    <T s={'Verified'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.sellerId}>
                    <td data-label={tx('Seller')}>
                      <b>{m.name}</b>
                      {m.email && <small style={{ display: 'block' }}>{m.email}</small>}
                    </td>
                    <td data-label={tx('Method')}>{METHOD_NAME[m.method] ?? m.method}</td>
                    <td data-label={tx('Account')}>{m.account}</td>
                    <td data-label={tx('Verified')}>
                      <T s={'Email {v0}, phone {v1}, ID {v2}'} v={{ v0: m.verified.email ? 'yes' : 'no', v1: m.verified.phone ? 'yes' : 'no', v2: m.verified.id ? 'yes' : 'no' }} />
                    </td>
                    <td data-label={tx('Status')}>{m.banned ? tx('Banned: payouts held') : tx('Active')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashShell>
  );
}
