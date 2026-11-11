import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { PickForm, SubPayForm } from '@/components/glass/SubForms';
import { creditsLeft, DAY, eligible, isLive, STATUS_LABEL, STATUS_TONE } from '@/lib/buyerSubs/rules';
import { allPlans, subsOf, subSettings } from '@/lib/buyerSubs/service';
import { publicWebsites } from '@/lib/glass/catalog';
import { listMethods } from '@/lib/payments/store';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Subscription', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const day = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : '–');

/*
 * The buyer's subscriptions (owner, 2026-11-12): plan and status, dates, websites chosen and left, the websites they may choose, downloads
 * (each chosen website is an order with the usual download links), licence and support dates, renewal and payment history. Support tickets use
 * the existing Support & disputes page.
 */
export default async function BuyerSubscription() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/subscription', roles: ['buyer', 'seller', 'admin'] });
  const now = Date.now();
  const [subs, plans, sites, methods, settings] = await Promise.all([viewer ? subsOf(viewer.id) : Promise.resolve([]), allPlans(), publicWebsites(), listMethods(true).catch(() => []), subSettings()]);
  const payMethods = methods.map((m) => ({ label: m.label, instructions: m.instructions }));
  const name = (key: string) => sites.find((s) => s.id === key)?.name ?? key;
  return (
    <BuyerShell viewer={viewer} active="subscription" file="buyer-websites" title="Subscription" subtitle="Your yearly plans, the websites you chose, and your licence and support dates.">
      {!subs.length && (
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>No subscription yet</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            A yearly plan lets you choose several websites with full source code, a licence and a year of support. Single websites can still be bought the usual way.
          </p>
          {settings.enabled ? (
            <Link className="btn" href="/subscriptions" style={{ alignSelf: 'flex-start' }} prefetch={false}>
              See the plans
            </Link>
          ) : (
            <span className="status st-draft" style={{ alignSelf: 'flex-start' }}>
              Coming soon
            </span>
          )}
        </section>
      )}
      {subs.map(({ sub, selections, payments }) => {
        const live = isLive(sub, now);
        const plan = plans.find((p) => p.id === sub.planId);
        const chosen = new Set(selections.map((x) => x.productKey));
        const options = live && plan ? sites.filter((s) => !chosen.has(s.id) && eligible(plan.eligibility, { id: s.id, category: s.cat })).map((s) => ({ key: s.id, name: s.name })) : [];
        const renewable = (sub.status === 'active' && !!sub.expiresAt && sub.expiresAt - now < 60 * DAY) || sub.status === 'expired';
        const renewalWaiting = payments.some((p) => p.kind === 'renewal' && p.status === 'submitted');
        const used = sub.creditsTotal ? Math.round((sub.creditsUsed / sub.creditsTotal) * 100) : 0;
        return (
          <section key={sub.id} className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <h2>{sub.plan.name}</h2>
                <div className="tag">
                  {usd(sub.amountCents)}
                  {sub.couponCode ? ` with ${sub.couponCode}` : ''} · renewal {usd(sub.plan.renewalCents)} · licence {sub.plan.licenceVersion}
                </div>
              </div>
              <span className={`status ${STATUS_TONE[sub.status]}`}>{STATUS_LABEL[sub.status]}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
              <div className="glass kpi">
                <div className="l">Started</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {day(sub.startsAt)}
                </div>
              </div>
              <div className="glass kpi">
                <div className="l">Ends</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {day(sub.expiresAt)}
                </div>
              </div>
              <div className="glass kpi">
                <div className="l">Websites chosen</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {sub.creditsUsed} / {sub.creditsTotal || sub.plan.websiteLimit}
                </div>
                <div className="s">{creditsLeft(sub)} left</div>
              </div>
            </div>
            {sub.creditsTotal > 0 && (
              <div className="bar" aria-label={`${used}% of your websites chosen`}>
                <i style={{ width: `${used}%` }} />
              </div>
            )}

            {sub.status === 'pending_payment' && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>Pay {usd(sub.amountCents)}</h3>
                <SubPayForm subscriptionId={sub.id} kind="new" methods={payMethods} />
              </div>
            )}
            {sub.status === 'payment_review' && <div className="tag">We are checking your payment. Your plan starts as soon as it is confirmed.</div>}

            {live && creditsLeft(sub) > 0 && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>Choose your websites</h3>
                <PickForm subscriptionId={sub.id} options={options} />
              </div>
            )}

            {selections.length > 0 && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>Your websites</h3>
                <div className="tbl" style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Website</th>
                        <th>Licence until</th>
                        <th>Support until</th>
                        <th>Files</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selections.map((x) => (
                        <tr key={x.id}>
                          <td>{name(x.productKey)}</td>
                          <td>{day(x.licenceExpiresAt)}</td>
                          <td>{day(x.supportUntil)}</td>
                          <td>
                            {x.orderId ? (
                              <Link className="btn sm ghost" href={`/orders/${x.orderId}`} prefetch={false}>
                                Open order
                              </Link>
                            ) : (
                              '–'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {renewable && !renewalWaiting && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 4 }}>Renew for {usd(sub.plan.renewalCents)}</h3>
                <div className="tag" style={{ marginBottom: 8 }}>
                  A renewal extends the licence and support of the websites you chose. It adds no new websites.
                </div>
                <SubPayForm subscriptionId={sub.id} kind="renewal" methods={payMethods} />
              </div>
            )}
            {renewalWaiting && <div className="tag">We are checking your renewal payment.</div>}

            {payments.length > 0 && (
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>Payments</h3>
                <div className="tbl" style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>For</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{day(p.createdAt)}</td>
                          <td>{p.kind === 'new' ? 'New plan' : 'Renewal'}</td>
                          <td>{usd(p.amountCents)}</td>
                          <td>{p.reference}</td>
                          <td>
                            <span className={`status ${p.status === 'verified' ? 'st-ok' : p.status === 'rejected' ? 'st-bad' : 'st-wait'}`}>
                              {p.status === 'submitted' ? 'Checking' : p.status === 'verified' ? 'Confirmed' : 'Not found'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="tag" style={{ margin: 0 }}>
              Need help with a chosen website? <Link href="/dashboard/buyer/support?new=1">Open a support ticket</Link>. When a plan ends, your sites keep running and your downloaded files stay yours;
              only the licence and free support end.
            </div>
          </section>
        );
      })}
    </BuyerShell>
  );
}
