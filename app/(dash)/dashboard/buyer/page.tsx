import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { DAY_MS, REVIEW_HOURS } from '@/lib/config';
import { buyerOverview } from '@/lib/glass/buyer';
import { buyerStatus, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Buyer overview', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : m < 2880 ? 'Yesterday' : `${Math.round(m / 1440)} days ago`;
};

/* design-reference/buyer.html: what the buyer owns, the order in its review (accepted or reported on its order page), what to do, updates and orders. */
export default async function BuyerOverview() {
  const viewer = await requireViewer({ path: '/dashboard/buyer', roles: ['buyer', 'seller', 'admin'] });
  const v = viewer ? await buyerOverview(viewer.id) : null;
  const first = viewer?.name?.split(' ')[0];
  const now = Date.now();
  const review = v?.orders.find((o) => o.state === 'delivered' && o.reviewEndsAt && o.reviewEndsAt > now) ?? null;
  const hoursLeft = review ? Math.max(0, Math.round((review.reviewEndsAt! - now) / 3_600_000)) : 0;
  const soon = v?.domains.filter((d) => d.expires && Date.parse(d.expires) - now < 30 * DAY_MS && Date.parse(d.expires) > now) ?? [];
  const todo = v
    ? [
        ...v.orders
          .filter((o) => o.state === 'delivered')
          .map((o) => ({
            key: o.id,
            tone: 'st-info',
            label: 'Review',
            text: `Approve or report ${plainWords(o.title)}${o.reviewEndsAt ? ` · ${Math.max(0, Math.round((o.reviewEndsAt - now) / 3_600_000))}h left` : ''}`,
            href: `/orders/${o.id}`,
            act: 'Check',
          })),
        ...v.orders
          .filter((o) => o.state === 'awaiting_payment' || o.state === 'payment_review')
          .map((o) => ({
            key: o.id + 'p',
            tone: 'st-wait',
            label: 'Payment',
            text: o.state === 'payment_review' ? `Payment for ${plainWords(o.title)} is being verified` : `Pay for ${plainWords(o.title)}`,
            href: `/orders/${o.id}`,
            act: 'View',
          })),
        ...v.orders
          .filter((o) => o.state === 'beta_requested')
          .map((o) => ({ key: o.id + 'b', tone: 'st-wait', label: 'Request', text: `${plainWords(o.title)} is waiting for our review`, href: `/orders/${o.id}`, act: 'View' })),
        ...soon.map((d) => ({
          key: d.name,
          tone: 'st-bad',
          label: 'Domain',
          text: `${d.name} expires in ${Math.ceil((Date.parse(d.expires!) - now) / DAY_MS)} days`,
          href: '/dashboard/buyer/domains',
          act: 'Renew',
        })),
      ]
    : [];
  return (
    <BuyerShell viewer={viewer} active="overview" file="buyer" title="Overview" head={false}>
      <div className="row">
        <div>
          <h1>{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>
          <div className="tag">Your websites, orders and domains in one place</div>
        </div>
      </div>
      {v && (
        <>
          <div className="kpis">
            <div className="glass kpi">
              <div className="l">Websites owned</div>
              <div className="v">{v.owned}</div>
              <div className="s">{v.owned ? 'Ready to download' : 'None yet'}</div>
            </div>
            <div className="glass kpi">
              <div className="l">In review</div>
              <div className="v">{v.inReview}</div>
              <div className="s">{review ? `${hoursLeft}h left to approve` : 'Waiting on you or on us'}</div>
            </div>
            <div className="glass kpi">
              <div className="l">Domains</div>
              <div className="v">{v.domains.length}</div>
              <div className="s">{soon.length ? `${soon.length} expires soon` : v.domains.some((d) => d.status === 'requested') ? 'Some being registered' : 'In your own name'}</div>
            </div>
            <div className="glass kpi">
              <div className="l">Open tickets</div>
              <div className="v">{v.openTickets}</div>
              <div className="s">{v.openTickets ? 'We are on it' : 'All quiet'}</div>
            </div>
          </div>

          {review ? (
            <section className="glass card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', borderColor: '#CFE9DF' }}>
              <div style={{ flex: '1 1 320px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h2>{plainWords(review.title)} is in review</h2>
                  <span className="status st-wait">{hoursLeft} hours left</span>
                </div>
                <div className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
                  {review.priceCents ? `Your ${usd(review.priceCents)} is held in escrow. ` : ''}Check the files and the domain setup, then approve to pay the seller. If something is wrong, report it
                  before the time runs out.
                </div>
                <div className="bar" style={{ marginTop: 14, maxWidth: 420 }}>
                  <i style={{ width: `${Math.round(Math.min(1, Math.max(0, 1 - hoursLeft / REVIEW_HOURS)) * 100)}%` }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn ghost" href={`/orders/${review.id}#problem`} prefetch={false}>
                  Report a problem
                </Link>
                <Link className="btn" href={`/orders/${review.id}#accept`} prefetch={false}>
                  Approve &amp; release
                </Link>
              </div>
            </section>
          ) : (
            <section className="glass card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', borderColor: '#CFE9DF' }}>
              <div style={{ flex: '1 1 320px' }}>
                <h2>Nothing is waiting for your review</h2>
                <div className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
                  When a seller delivers, you get {REVIEW_HOURS} hours to check it before the money is released. Websites are free for early users during the beta.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn" href="/websites" prefetch={false}>
                  Browse websites
                </Link>
              </div>
            </section>
          )}

          <div className="grid2">
            <section className="glass card">
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>To do</h2>
                <span className={todo.length ? 'status st-wait' : 'status st-ok'}>{todo.length} items</span>
              </div>
              {todo.length ? (
                todo.slice(0, 6).map((t) => (
                  <div key={t.key} className="li">
                    <span className={`status ${t.tone}`}>{t.label}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{t.text}</div>
                    <Link className="btn sm ghost" href={t.href} prefetch={false}>
                      {t.act}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="li">
                  <div style={{ flex: 1, fontSize: 14 }} className="muted">
                    Nothing to do right now.
                  </div>
                </div>
              )}
            </section>
            <section className="glass card">
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>Latest updates</h2>
                <Link className="tag" style={{ margin: 0 }} href="/dashboard/buyer/notifications" prefetch={false}>
                  See all
                </Link>
              </div>
              {v.notes.length ? (
                v.notes.slice(0, 4).map((n) => (
                  <div key={n.id} className="li">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? '#7C9FC4' : '#3F8F77', flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{n.subject}</div>
                    <span className="tag" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                      {ago(n.at, now)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="li">
                  <div style={{ flex: 1, fontSize: 14 }} className="muted">
                    Nothing yet. Order updates show up here.
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ padding: '14px 14px 4px' }}>
              <h2>Recent orders</h2>
              <Link className="tag" style={{ margin: 0 }} href="/dashboard/buyer/orders" prefetch={false}>
                All orders
              </Link>
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {v.orders.length ? (
                    v.orders.slice(0, 5).map((o) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: 500 }}>
                          <Link href={`/orders/${o.id}`} prefetch={false}>
                            {orderCode(o.id)}
                          </Link>
                        </td>
                        <td>{plainWords(o.title)}</td>
                        <td>{usd(o.priceCents)}</td>
                        <td>{o.state.startsWith('beta_') ? 'Free beta' : (o.payment?.brand ?? '—')}</td>
                        <td>
                          <span className={`status ${TONE[buyerStatus(o.state).tone]}`}>{buyerStatus(o.state).label}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        No orders yet. <Link href="/websites">Browse websites</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </BuyerShell>
  );
}
