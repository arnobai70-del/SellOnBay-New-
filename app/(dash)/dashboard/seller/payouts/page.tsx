import type { Metadata } from 'next';
import Link from 'next/link';
import { PayoutMethodForm } from '@/components/glass/PayoutMethodForm';
import { VerificationForm } from '@/components/glass/SellerForms';
import { SellerShell } from '@/components/glass/SellerShell';
import { PAYOUT_TEXT, PLAN_FEE_TEXT, PLAN_KEEP_TEXT } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { shortDate, usd } from '@/lib/glass/orderStatus';
import { storeProfile, verificationOf } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { split } from '@/lib/ledger';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { payoutMethodsFor } from '@/lib/payoutDetails';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Earnings and payouts', robots: { index: false } };
export const dynamic = 'force-dynamic';

const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const DOC: Record<string, string> = { passport: 'Passport', national_id: 'National ID card', driver_licence: 'Driver licence' };
const DROP: React.CSSProperties = { border: '2px dashed #BFD8E2', borderRadius: 14, padding: 16, textAlign: 'center', fontSize: 13 };

/*
 * design-reference/seller-payouts.html: balances, the identity check (VerificationForm, Finance only sees it), where earnings go (bKash only for
 * Bangladesh), how each sale this month is split, and every payout. The sales PDF is at Store & analytics.
 */
export default async function SellerPayouts() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/payouts', roles: ['seller', 'admin'] });
  const [v, store, ver, orders] = viewer
    ? await Promise.all([
        sellerDashboard(viewer.id),
        storeProfile(viewer.id, viewer.name),
        verificationOf(viewer.id),
        (async () => (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id))(),
      ])
    : [null, null, null, []];
  const now = Date.now();
  const monthFrom = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const yearFrom = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  const month = orders.filter((o) => o.fundedAt && o.fundedAt >= monthFrom).sort((a, b) => (b.fundedAt ?? 0) - (a.fundedAt ?? 0));
  const net = (o: (typeof orders)[number]) => split(o.lines, o.feeCents, o.sellerGrossCents).sellerNet;
  const paidYear = v ? v.payouts.filter((p) => p.status === 'paid' && (p.paidAt ?? 0) >= yearFrom) : [];
  const monthName = new Date(now).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return (
    <SellerShell viewer={viewer} active="payouts" file="seller-payouts" title={tx('Earnings & payouts')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Earnings & payouts'} />
          </h1>
          <div className="tag">
            <T s={'Your {PLAN_KEEP_TEXT} share, statements and how you get paid. {PAYOUT_TEXT}.'} v={{ PLAN_KEEP_TEXT, PAYOUT_TEXT }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn ghost" href="/dashboard/seller/reports" prefetch={false}>
            <T s={'Statement PDF'} />
          </Link>
        </div>
      </div>
      {v && store && ver && (
        <>
          <div className="kpis">
            <div className="glass kpi">
              <div className="l">
                <T s={'Available'} />
              </div>
              <div className="v">{usd(v.availableCents)}</div>
              <div className="s">
                <T s={'Paid {v0}'} v={{ v0: shortDay(v.nextPayout) }} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'In escrow'} />
              </div>
              <div className="v">{usd(v.escrowCents)}</div>
              <div className="s">
                <T s={'Released after review'} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Earned this month'} />
              </div>
              <div className="v">{usd(month.reduce((s, o) => s + net(o), 0))}</div>
              <div className="s">
                <T s={'{length} sales'} v={{ length: month.length }} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Paid out this year'} />
              </div>
              <div className="v">{usd(paidYear.reduce((s, p) => s + p.amountCents, 0))}</div>
              <div className="s">
                <T s={'{length} payouts'} v={{ length: paidYear.length }} />
              </div>
            </div>
          </div>
          {(v.pendingCents > 0 || v.debtCents > 0) && (
            <section className="glass card" role="status">
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>
                  <T s={'On the 7-day hold after the buyer accepted'} />
                </span>
                <b style={{ fontWeight: 500 }}>{usd(v.pendingCents)}</b>
              </div>
              {v.debtCents > 0 && (
                <div className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>
                    <T s={'Owed back after a refund or fee, taken from your next earnings'} />
                  </span>
                  <b style={{ fontWeight: 500 }}>{usd(v.debtCents)}</b>
                </div>
              )}
            </section>
          )}
          <div className="grid2">
            <section className="glass card" id="verify" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row">
                <h2>
                  <T s={'Identity'} />
                </h2>
                <span className={`status ${ver.status === 'approved' ? 'st-ok' : ver.status === 'pending' ? 'st-wait' : ver.status === 'rejected' ? 'st-bad' : 'st-draft'}`}>
                  {ver.status === 'approved' ? tx('Verified') : ver.status === 'pending' ? tx('Being checked') : ver.status === 'rejected' ? tx('Not accepted') : tx('Not sent')}
                </span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <T s={'We need a passport, national ID card or driver licence once, before the first payout. Only our finance team can see it; buyers never do.'} />
              </p>
              {ver.status === 'approved' || ver.status === 'pending' ? (
                <div className="grid2" style={{ gap: 10 }}>
                  <div style={DROP}>
                    {ver.docType ? DOC[ver.docType] : tx('Document')}
                    <div className="tag">
                      <T s={'Uploaded ✓'} />
                    </div>
                  </div>
                  <div style={DROP}>
                    <T s={'Check'} />
                    <div className="tag">{ver.status === 'approved' ? tx('Done ✓') : tx('We will tell you when it is done')}</div>
                  </div>
                </div>
              ) : (
                <>
                  {ver.status === 'rejected' && (
                    <div className="tag" style={{ color: '#7A2E24' }}>
                      {ver.note ?? tx('Please send a clearer picture.')}
                    </div>
                  )}
                  <VerificationForm />
                </>
              )}
            </section>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PayoutMethodForm methods={payoutMethodsFor(store.country).map(([m, l]) => [m, l] as [string, string])} current={store.payoutLabel} />
              {!store.country && (
                <div className="tag">
                  <T s={'Add your country in'} />{' '}
                  <Link href="/dashboard/seller/account">
                    <T s={'Account'} />
                  </Link>{' '}
                  <T s={'first, so the right methods show.'} />
                </div>
              )}
            </div>
          </div>
          <section className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ padding: '14px 14px 4px' }}>
              <h2>
                <T s={'Statement · {monthName}'} v={{ monthName }} />
              </h2>
              <span className="tag" style={{ margin: 0 }}>
                <T s={'How each sale is split'} />
              </span>
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Date'} />
                    </th>
                    <th>
                      <T s={'Order'} />
                    </th>
                    <th>
                      <T s={'Website'} />
                    </th>
                    <th>
                      <T s={'Price'} />
                    </th>
                    <th>
                      <T s={'Coupon'} />
                    </th>
                    <th>
                      <T s={'Platform {PLAN_FEE_TEXT}'} v={{ PLAN_FEE_TEXT }} />
                    </th>
                    <th>
                      <T s={'You {PLAN_KEEP_TEXT}'} v={{ PLAN_KEEP_TEXT }} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {month.length ? (
                    month.map((o) => (
                      <tr key={o.id}>
                        <td>{shortDate(o.fundedAt!)}</td>
                        <td style={{ fontWeight: 500 }}>
                          <Link href={`/orders/${o.id}`} prefetch={false}>
                            {orderCode(o.id)}
                          </Link>
                        </td>
                        <td>{plainWords(o.title)}</td>
                        <td>{usd(o.priceCents)}</td>
                        <td className="muted">—</td>
                        <td>{usd(o.feeCents)}</td>
                        <td>{usd(net(o))}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="muted">
                        <T s={'No paid sales this month yet.'} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ padding: '14px 14px 4px' }}>
              <h2>
                <T s={'Payout history'} />
              </h2>
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Date'} />
                    </th>
                    <th>
                      <T s={'Amount'} />
                    </th>
                    <th>
                      <T s={'Method'} />
                    </th>
                    <th>
                      <T s={'Status'} />
                    </th>
                    <th>
                      <span className="hidden-label">
                        <T s={'Reference'} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {v.payouts.length ? (
                    v.payouts.map((p) => (
                      <tr key={p.id}>
                        <td>{shortDay(p.weekStart)}</td>
                        <td>{usd(p.amountCents)}</td>
                        <td>{p.method}</td>
                        <td>
                          <span className={`status ${p.status === 'paid' ? 'st-ok' : p.status === 'failed' ? 'st-bad' : 'st-info'}`}>
                            {p.status === 'paid' ? tx('Paid') : p.status === 'failed' ? tx('Failed') : p.status === 'exported' ? tx('Being sent') : tx('Scheduled')}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }} className="tag">
                          {p.reference ?? ''}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        <T s={'No payouts yet. {PAYOUT_TEXT}.'} v={{ PAYOUT_TEXT }} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </SellerShell>
  );
}
