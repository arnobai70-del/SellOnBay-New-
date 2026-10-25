import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { PlanButton } from '@/components/PlanButton';
import Link from 'next/link';
import { emailsOf, listPayouts, payoutOrders, sellerPayoutMethods, weekStartOf } from '@/lib/payouts';
import { PAYOUT_METHODS } from '@/lib/payoutDetails';
import { paypalConfigured } from '@/lib/providers/payment';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Payouts', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });

const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '-');
const METHOD_NAME = Object.fromEntries(PAYOUT_METHODS) as Record<string, string>;
const STATUSES = ['scheduled', 'exported', 'paid', 'failed'] as const;

export default async function Payouts({ searchParams }: { searchParams: Promise<{ method?: string; status?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/payouts', roles: ['admin'] });
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
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-payouts" title="Payouts">
      <div className="kpis">
        <div className="kpi">
          <small>Waiting to be sent</small>
          <b>{money(sum(open))}</b>
          <em>{open.length} payouts</em>
        </div>
        <div className="kpi">
          <small>Paid, last 30 days</small>
          <b>{money(sum(paidLately))}</b>
          <em>{paidLately.length} payouts</em>
        </div>
        <div className="kpi">
          <small>Failed</small>
          <b>{everything.filter((p) => p.status === 'failed').length}</b>
          <em>Orders wait for the next batch</em>
        </div>
        {PAYOUT_METHODS.map(([m, label]) => (
          <div className="kpi" key={m}>
            <small>{label}, waiting</small>
            <b>{money(sum(open.filter((p) => p.method === m)))}</b>
            <em>{methods.filter((x) => x.method === m).length} sellers use it</em>
          </div>
        ))}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Weekly payouts</h2>
            <p className="sub">
              Sellers are paid for orders accepted at least 7 days ago. Make the batch (it also runs every Sunday), download the CSV, send the money with Payoneer, Wise or the bank, then mark each
              payout paid with the transfer reference. Sellers who chose PayPal can be paid with one click (Send with PayPal), then Check PayPal marks it paid when it arrives. Nothing is sent unless
              you click.
            </p>
          </div>
        </div>
        <PlanButton week={week} />
        <div className="adm-btns" aria-label="Filter payouts">
          <Link className={'btn btn-sm ' + (!method && !status ? 'btn-dark' : 'btn-line')} href="/dashboard/admin/payouts">
            All
          </Link>
          {PAYOUT_METHODS.map(([m, label]) => (
            <Link key={m} className={'btn btn-sm ' + (method === m ? 'btn-dark' : 'btn-line')} href={`/dashboard/admin/payouts?method=${m}${status ? `&status=${status}` : ''}`}>
              {label}
            </Link>
          ))}
          {STATUSES.map((s) => (
            <Link key={s} className={'btn btn-sm ' + (status === s ? 'btn-dark' : 'btn-line')} href={`/dashboard/admin/payouts?status=${s}${method ? `&method=${method}` : ''}`}>
              {s}
            </Link>
          ))}
        </div>
        {toExport.length > 0 && (
          <p>
            Waiting weeks:{' '}
            {[...new Set(toExport.map((p) => p.weekStart))].map((w) => (
              <form key={w} method="post" action={`/api/admin/payouts/csv?week=${w}`} style={{ display: 'inline' }}>
                <button type="submit" className="btn btn-gold btn-sm" style={{ marginRight: 8 }}>
                  Download CSV for {w}
                </button>
              </form>
            ))}
          </p>
        )}
        {all.length === 0 && <p className="muted">No payouts yet. They appear once an accepted order has passed its 7-day hold.</p>}
        {weeks.map((w) => (
          <div key={w} className="adm-table-wrap">
            <h3 style={{ marginTop: 18 }}>Week starting {w}</h3>
            <table className="adm-table stack">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Method</th>
                  <th>Send to</th>
                  <th>Amount</th>
                  <th>Orders</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {all
                  .filter((p) => p.weekStart === w)
                  .map((p) => (
                    <tr key={p.id}>
                      <td data-label="Seller">
                        <b>{p.sellerName}</b>
                        {emails.get(p.sellerId) && <small style={{ display: 'block' }}>{emails.get(p.sellerId)}</small>}
                      </td>
                      <td data-label="Method">{METHOD_NAME[p.method] ?? p.method}</td>
                      <td data-label="Send to">{p.account}</td>
                      <td data-label="Amount">
                        <b>{money(p.amountCents)}</b>
                      </td>
                      <td data-label="Orders">
                        {p.orderIds.length}
                        {orders.get(p.id)?.length ? (
                          <details>
                            <summary>Show</summary>
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
                      <td data-label="Status">
                        {p.status}
                        {p.reference ? ` (${p.reference})` : ''}
                        <small style={{ display: 'block' }}>
                          Made {day(p.createdAt)}
                          {p.exportedAt ? `, sent ${day(p.exportedAt)}` : ''}
                          {p.paidAt ? `, paid ${day(p.paidAt)}` : ''}
                        </small>
                      </td>
                      <td data-label="Action">
                        {paypal && p.method === 'paypal' && (p.status === 'scheduled' || p.status === 'exported') && !p.reference?.startsWith('paypal:') && (
                          <AdminForm
                            endpoint={`/api/admin/payouts/${p.id}/paypal`}
                            fixed={{ action: 'send' }}
                            fields={[]}
                            openLabel="Send with PayPal"
                            submit={`Send ${money(p.amountCents)} to ${p.account}`}
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
                        {p.status === 'scheduled' && <small className="muted">Download the CSV first</small>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="dp" id="methods">
        <div className="hd">
          <div>
            <h2>Seller payout methods</h2>
            <p className="sub">Where each seller wants to be paid. When a seller changes it, you are told here and by email. Only you see the full account.</p>
          </div>
        </div>
        {methods.length === 0 && <p className="muted">No seller has saved a payout method yet. Sellers add it on their dashboard.</p>}
        {methods.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table stack">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Method</th>
                  <th>Account</th>
                  <th>Verified</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.sellerId}>
                    <td data-label="Seller">
                      <b>{m.name}</b>
                      {m.email && <small style={{ display: 'block' }}>{m.email}</small>}
                    </td>
                    <td data-label="Method">{METHOD_NAME[m.method] ?? m.method}</td>
                    <td data-label="Account">{m.account}</td>
                    <td data-label="Verified">
                      Email {m.verified.email ? 'yes' : 'no'}, phone {m.verified.phone ? 'yes' : 'no'}, ID {m.verified.id ? 'yes' : 'no'}
                    </td>
                    <td data-label="Status">{m.banned ? 'Banned: payouts held' : 'Active'}</td>
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
