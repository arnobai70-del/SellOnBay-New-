import type { Metadata } from 'next';
import Link from 'next/link';
import { SellerShell } from '@/components/glass/SellerShell';
import { CONFIG, PLAN_KEEP_TEXT } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { usd } from '@/lib/glass/orderStatus';
import { storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Customization'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const STATE: Record<string, [string, string]> = {
  pending: ['Waiting for buyer', 'st-wait'],
  funded: ['Funded, start work', 'st-ok'],
  declined: ['Declined', 'st-bad'],
  cancelled: ['Taken back', 'st-draft'],
};

/*
 * design-reference/seller-customization.html. Custom work here is extra work on an order: the seller sends it from the order page (title, price,
 * more days, only before delivery), the buyer pays it into escrow, and work starts only once it shows Funded (lib/orders/extra.ts).
 */
export default async function SellerCustomization() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/customization', roles: ['seller', 'admin'] });
  const [v, store] = viewer ? await Promise.all([sellerDashboard(viewer.id), storeProfile(viewer.id, viewer.name)]) : [null, null];
  const x = CONFIG.extraWork;
  const yearFrom = Date.UTC(new Date().getUTCFullYear(), 0, 1);
  const extras = v?.extras ?? [];
  const waiting = extras.filter((e) => e.request.state === 'pending');
  const funded = extras.filter((e) => e.request.state === 'funded');
  const earned = funded.filter((e) => (e.request.fundedAt ?? 0) >= yearFrom).reduce((s, e) => s + e.request.priceCents - e.request.feeCents, 0);
  const canSend = (v?.toDeliver ?? []).filter(({ order: o }) => ['funded', 'in_delivery'].includes(o.state));
  return (
    <SellerShell viewer={viewer} active="customization" file="seller-customization" title={tx('Customization')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Customization'} />
          </h1>
          <div className="tag">
            <T s={'Paid changes on top of an order, held in escrow. The buyer pays before you start.'} />
          </div>
        </div>
        {store && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 14 }}>
              <T s={'Accepting requests'} />
            </span>
            <Link
              className={store.customAvailable ? 'sw on' : 'sw'}
              href="/dashboard/seller/store#profile"
              prefetch={false}
              aria-label={`Accepting customization requests: ${store.customAvailable ? 'on' : 'off'}. Change it in your store profile`}
            />
          </div>
        )}
      </div>
      {v && store && (
        <>
          <div className="kpis">
            <div className="glass kpi">
              <div className="l">
                <T s={'Waiting for buyers'} />
              </div>
              <div className="v">{waiting.length}</div>
              <div className="s">
                <T s={'Sent, not paid yet'} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Active projects'} />
              </div>
              <div className="v">{funded.length}</div>
              <div className="s">
                <T s={'Funded, start work'} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Earned from custom work'} />
              </div>
              <div className="v">{usd(earned)}</div>
              <div className="s">
                <T s={'This year · {PLAN_KEEP_TEXT}'} v={{ PLAN_KEEP_TEXT }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <section className="glass card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row">
                <h2>
                  <T s={'How it works'} />
                </h2>
                <span className="status st-info">
                  <T s={'Escrow'} />
                </span>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <T
                  s={'Open an order and send extra work with a title, a price from {v0} to {v1} and {minDays} to {maxDays} more days. Only before you deliver. Start when it shows Funded.'}
                  v={{ v0: usd(x.minCents), v1: usd(x.maxCents), minDays: x.minDays, maxDays: x.maxDays }}
                />
              </p>
              <div className="tag" style={{ margin: 0 }}>
                <T s={'Your store {v0} “Available for customization”.'} v={{ v0: store.customAvailable ? 'shows' : 'does not show' }} />{' '}
                <Link href="/dashboard/seller/store#profile">
                  <T s={'Change it'} />
                </Link>
              </div>
            </section>
            <section className="glass card" style={{ flex: '999 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row">
                <h2>
                  <T s={'Send extra work'} />
                </h2>
                <span className="tag" style={{ margin: 0 }}>
                  <T s={'Buyer pays into escrow'} />
                </span>
              </div>
              {canSend.length ? (
                canSend.map(({ order: o }) => (
                  <div key={o.id} className="li" style={{ fontSize: 14 }}>
                    <span style={{ flex: 1 }}>{plainWords(o.title)}</span>
                    <Link className="btn sm ghost" href={`/orders/${o.id}#extra`} prefetch={false}>
                      <T s={'Send an offer'} />
                    </Link>
                  </div>
                ))
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  <T s={'No order can take extra work right now: it is offered on an order you have not delivered yet.'} />
                </p>
              )}
            </section>
          </div>
          <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-disabled="true">
            <div className="row">
              <h2>
                <T s={'Your offer'} />
              </h2>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="status st-draft">
                  <T s={'Coming soon'} />
                </span>
                <span className="tag" style={{ margin: 0 }}>
                  <T s={'Buyer pays into escrow per milestone'} />
                </span>
              </span>
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Milestone'} />
                    </th>
                    <th>
                      <T s={'Days'} />
                    </th>
                    <th>
                      <T s={'Price'} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <label className="hidden-label" htmlFor="mt0">
                        <T s={'Milestone'} />
                      </label>
                      <input id="mt0" className="input" placeholder={tx('For example: new colours and logo')} disabled style={{ minHeight: 38 }} />
                    </td>
                    <td style={{ width: 90 }}>
                      <label className="hidden-label" htmlFor="md0">
                        <T s={'Days'} />
                      </label>
                      <input id="md0" className="input" placeholder="2" disabled style={{ minHeight: 38 }} />
                    </td>
                    <td style={{ width: 110 }}>
                      <label className="hidden-label" htmlFor="mp0">
                        <T s={'Price'} />
                      </label>
                      <input id="mp0" className="input" placeholder="$40" disabled style={{ minHeight: 38 }} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="row">
              <button className="btn sm ghost" type="button" disabled>
                <T s={'+ Add milestone'} />
              </button>
              <button className="btn" type="button" disabled>
                <T s={'Send offer'} />
              </button>
            </div>
            <div className="tag" style={{ margin: 0 }}>
              <T s={'Offers in milestones are coming soon. Until then, send extra work on an order above.'} />
            </div>
          </section>
          <section className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ padding: '14px 14px 4px' }}>
              <h2>
                <T s={'Extra work you sent'} />
              </h2>
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Work'} />
                    </th>
                    <th>
                      <T s={'Order'} />
                    </th>
                    <th>
                      <T s={'Price'} />
                    </th>
                    <th>
                      <T s={'More days'} />
                    </th>
                    <th>
                      <T s={'Status'} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {extras.length ? (
                    extras.map(({ order, request }) => {
                      const [label, tone] = STATE[request.state] ?? [request.state, 'st-draft'];
                      return (
                        <tr key={request.id}>
                          <td style={{ fontWeight: 500 }}>{request.title}</td>
                          <td>
                            <Link href={`/orders/${order.id}`} prefetch={false}>
                              {plainWords(order.title)}
                            </Link>
                          </td>
                          <td>{usd(request.priceCents)}</td>
                          <td>+{request.addDays}</td>
                          <td>
                            <span className={`status ${tone}`}>{label}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        <T s={'No extra work yet.'} />
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
