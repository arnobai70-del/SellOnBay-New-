import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DeliveryForm } from '@/components/DeliveryForm';
import { SellerShell } from '@/components/glass/SellerShell';
import { PLAN_KEEP_TEXT, REVIEW_HOURS } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { listFiles } from '@/lib/files/store';
import { profileNames } from '@/lib/glass/admin';
import { buyerStatus, shortDate, usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { split } from '@/lib/ledger';
import type { Order } from '@/lib/orders/machine';
import { orderStore } from '@/lib/orders/store';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Orders and escrow', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['all', 'All'],
  ['review', 'In review'],
  ['released', 'Released'],
  ['refunded', 'Refunded'],
] as const;
const RELEASED = ['accepted', 'payout_pending', 'paid_out'];
const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;
const timeLeft = (dueAt: number | null | undefined, now: number) => {
  if (!dueAt) return 'No deadline';
  const h = Math.floor((dueAt - now) / 3_600_000);
  if (h < 0) return 'Overdue';
  return h >= 48 ? `${Math.floor(h / 24)} days left` : `${h} hours left`;
};
const share = (o: Order) => (o.fundedAt ? split(o.lines, o.feeCents, o.sellerGrossCents).sellerNet - Math.min(o.refundedCents, o.priceCents) : 0);

/*
 * design-reference/seller-orders.html: every order sold with the seller's share and when it is released, plus the orders to deliver with the same
 * actions as before (deliver, the GitHub invite, delivery files, the record PDF) and repository access to take back after a refund.
 */
export default async function SellerOrders({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/seller/orders', roles: ['seller', 'admin'] });
  const { tab: raw } = await searchParams;
  const tab = TABS.find(([k]) => k === raw)?.[0] ?? 'all';
  const [v, files, all] = viewer ? await Promise.all([sellerDashboard(viewer.id), listFiles({ uploadedBy: viewer.id }), (await orderStore()).forUser(viewer.id)]) : [null, [], [] as Order[]];
  const sold = all.filter((o) => o.sellerId === viewer?.id).sort((a, b) => b.createdAt - a.createdAt);
  const names = await profileNames(sold.map((o) => o.buyerId));
  const deliveryFiles = (orderId: string) => files.filter((f) => f.purpose === 'delivery' && f.orderId === orderId);
  const now = Date.now();
  const monthFrom = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const inReview = sold.filter((o) => o.state === 'delivered');
  const released = sold.filter((o) => RELEASED.includes(o.state) && (o.acceptedAt ?? 0) >= monthFrom);
  const problems = sold.filter((o) => o.state === 'disputed' || o.state === 'fix_requested');
  const refunded = sold.filter((o) => o.state === 'refunded' || o.refundedCents > 0);
  const rows = sold
    .filter((o) => (tab === 'review' ? o.state === 'delivered' : tab === 'released' ? RELEASED.includes(o.state) : tab === 'refunded' ? o.state === 'refunded' || o.refundedCents > 0 : true))
    .slice(0, 100);
  return (
    <SellerShell viewer={viewer} active="orders" file="seller-orders" title="Orders & escrow" head={false}>
      <div className="row">
        <div>
          <h1>Orders &amp; escrow</h1>
          <div className="tag">Who bought what, and when your money is released. Deliver before the time runs out.</div>
        </div>
        <div className="seg" role="tablist" aria-label="Order filter">
          {TABS.map(([k, l]) => (
            <Link key={k} role="tab" className={k === tab ? 'on' : ''} aria-selected={k === tab} href={k === 'all' ? '/dashboard/seller/orders' : `/dashboard/seller/orders?tab=${k}`} prefetch={false}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">In review now</div>
          <div className="v">{inReview.length}</div>
          <div className="s">{usd(inReview.reduce((s, o) => s + share(o), 0))} your share</div>
        </div>
        <div className="glass kpi">
          <div className="l">Released this month</div>
          <div className="v">{released.length}</div>
          <div className="s">{usd(released.reduce((s, o) => s + share(o), 0))} your share</div>
        </div>
        <div className="glass kpi">
          <div className="l">Open problems</div>
          <div className="v">{problems.length}</div>
          <div className="s">{problems.length ? 'Payment on hold' : 'None'}</div>
        </div>
        <div className="glass kpi">
          <div className="l">Refunded</div>
          <div className="v">{refunded.length}</div>
          <div className="s">{usd(refunded.reduce((s, o) => s + Math.max(0, share(o)), 0))} earned</div>
        </div>
      </div>

      {v && v.toDeliver.length > 0 && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>To deliver</h2>
            <span className="tag" style={{ margin: 0 }}>
              The buyer&apos;s money is held in escrow until they accept
            </span>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer&apos;s domain</th>
                  <th>Time left</th>
                  <th>You earn</th>
                  <th>
                    <span className="hidden-label">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.toDeliver.map(({ order: o, earnCents, held }) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}>
                      {plainWords(o.title)}
                      {o.express && <div className="tag">Express</div>}
                    </td>
                    <td>{o.domain?.name ?? (o.githubUsername ? `GitHub: ${o.githubUsername}` : '-')}</td>
                    <td>{held ? 'Paused for a safety check' : timeLeft(o.dueAt, now)}</td>
                    <td>{usd(earnCents)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        <Link className="btn sm ghost" href={`/messages/${o.id}`} prefetch={false}>
                          Open chat
                        </Link>
                        {/* A quotation order's delivery is sent for release and released by SellOnBay; the seller never marks it delivered. */}
                        {o.quotationId && o.state === 'funded' && <span className="tag">Waiting for SellOnBay to authorise the work.</span>}
                        {o.quotationId && o.state === 'release_pending' && <span className="tag">Sent. Waiting for SellOnBay to release it.</span>}
                        {o.quotationId && ['in_delivery', 'overdue', 'fix_requested'].includes(o.state) && (
                          <DeliveryForm
                            orderId={o.id}
                            approvedFiles={deliveryFiles(o.id)
                              .filter((f) => f.state === 'approved')
                              .map((f) => ({ id: f.id, name: f.originalName }))}
                            pending={deliveryFiles(o.id).filter((f) => ['awaiting_upload', 'checking', 'awaiting_review'].includes(f.state)).length}
                          />
                        )}
                        {!o.quotationId &&
                          (o.state === 'fix_requested' || (o.deliveryType !== 'repo_access' && !o.instant && (o.state === 'funded' || o.state === 'in_delivery' || o.state === 'overdue'))) && (
                            <AdminForm endpoint={`/api/orders/${o.id}/deliver`} fields={[]} submit="Yes, it is live and ready" openLabel="I delivered it" tone="dark" />
                          )}
                        {o.deliveryType === 'repo_access' && (o.quotationId ? o.state === 'delivered' && !!o.releaseApprovedAt : o.state === 'funded' || o.state === 'in_delivery') && (
                          <AdminForm
                            endpoint={o.state === 'funded' ? `/api/orders/${o.id}/handover` : `/api/orders/${o.id}/resend-invite`}
                            fields={[]}
                            submit={o.state === 'funded' ? 'I sent the invite' : 'Send the invite again'}
                            openLabel={o.state === 'funded' ? 'I sent the invite' : 'Send the invite again'}
                            tone="line"
                          />
                        )}
                        <a className="tag" href={`/api/orders/${o.id}/evidence`} download>
                          Record (PDF)
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {v && v.revocations.length > 0 && (
        <section className="glass card" data-revocations>
          <h2>Remove access to a repository</h2>
          <div className="tag">These orders were refunded or cancelled after you sent the GitHub invite. Remove the buyer from your private repository, then tell us.</div>
          {v.revocations.map((c) => (
            <div key={c.orderId} className="li" style={{ fontSize: 14 }}>
              <span style={{ flex: 1 }}>
                {plainWords(c.title)} · remove GitHub user {c.github || 'the buyer'}
              </span>
              <AdminForm endpoint={`/api/orders/${c.orderId}/revoke-done`} fields={[]} submit="I removed the access" openLabel="I removed the access" tone="dark" />
            </div>
          ))}
        </section>
      )}

      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Website</th>
                <th>Buyer</th>
                <th>Price</th>
                <th>You get ({PLAN_KEEP_TEXT})</th>
                <th>Status</th>
                <th>Released in</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((o) => {
                  const st = buyerStatus(o.state);
                  const left = o.state === 'delivered' && o.reviewEndsAt ? o.reviewEndsAt - now : null;
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 500 }}>
                        <Link href={`/orders/${o.id}`} prefetch={false}>
                          {orderCode(o.id)}
                        </Link>
                      </td>
                      <td>{plainWords(o.title)}</td>
                      <td>{names.get(o.buyerId ?? '') ?? '—'}</td>
                      <td>{usd(o.priceCents)}</td>
                      <td>{usd(Math.max(0, share(o)))}</td>
                      <td>
                        <span className={`status ${o.state === 'disputed' ? 'st-bad' : TONE[st.tone]}`}>{o.state === 'disputed' ? 'Problem reported' : st.label}</span>
                      </td>
                      <td style={{ minWidth: 130 }}>
                        {left !== null && left > 0 ? (
                          <>
                            <div className="tag" style={{ margin: '0 0 6px' }}>
                              {Math.round(left / 3_600_000)}h
                            </div>
                            <div className="bar">
                              <i style={{ width: `${Math.round(Math.min(1, Math.max(0, 1 - left / (REVIEW_HOURS * 3_600_000))) * 100)}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className="tag" style={{ margin: 0 }}>
                            {RELEASED.includes(o.state) && o.acceptedAt
                              ? `Released ${shortDate(o.acceptedAt)}`
                              : o.state === 'refunded'
                                ? 'Refunded'
                                : o.state === 'disputed' || o.state === 'fix_requested'
                                  ? 'On hold'
                                  : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No orders here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass card">
        <h2>How you get paid</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px, 100%),1fr))', gap: 12, marginTop: 12, fontSize: 14 }}>
          {(
            [
              ['1 · Buyer pays', 'Money goes to escrow, not to anyone yet', false],
              [`2 · ${REVIEW_HOURS}-hour review`, 'Buyer checks files and setup', false],
              ['3 · Released', 'Buyer approves or the time ends with no problem', false],
              ['4 · Payout', 'Paid to your payout method on Thursday, after the 7-day hold', true],
            ] as const
          ).map(([b, t, mint]) => (
            <div key={b} style={{ padding: 14, borderRadius: 14, background: mint ? '#E6F5EF' : 'rgba(255,255,255,.7)', border: mint ? '1px solid #CFE9DF' : '1px solid #DCE7EC' }}>
              <b style={{ fontWeight: 500 }}>{b}</b>
              <div className="tag">{t}</div>
            </div>
          ))}
        </div>
      </section>
    </SellerShell>
  );
}
