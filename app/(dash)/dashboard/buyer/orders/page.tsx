import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { BETA_METHOD } from '@/lib/beta/rules';
import { REVIEW_HOURS } from '@/lib/config';
import { buyerOrders } from '@/lib/glass/buyer';
import { ORDER_TABS, buyerStatus, orderTab, shortDate, usd, type OrderTab } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import type { Order } from '@/lib/orders/machine';
import { orderCode } from '@/lib/payments/rules';
import { listAttempts } from '@/lib/payments/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Orders and payments', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TAB_LABEL: Record<OrderTab, string> = { all: 'All', progress: 'In progress', done: 'Completed', refunded: 'Refunded' };
const TONE = { ok: 'st-ok', wait: 'st-wait', bad: 'st-bad', info: 'st-info', draft: 'st-draft' } as const;
const method = (o: Order) =>
  o.payment?.ref === 'subscription' ? 'Subscription' : o.payment?.brand === BETA_METHOD || o.state.startsWith('beta_') ? 'Free (beta)' : o.payment?.brand ? o.payment.brand : '—';

/*
 * design-reference/buyer-orders.html: every order with its payment and receipt (/api/orders/[id]/receipt), a payment being checked shown on top
 * (the reference is changed on the order's own page), and the refunds. The top bar's search filters this list (?q=).
 */
export default async function BuyerOrders({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/buyer/orders', roles: ['buyer', 'seller', 'admin'] });
  const { tab: raw, q: rawQ } = await searchParams;
  const tab: OrderTab = (ORDER_TABS as readonly string[]).includes(String(raw)) ? (raw as OrderTab) : 'all';
  const q = (rawQ ?? '').trim().toLowerCase().replace(/^#/, '').slice(0, 80);
  const orders = viewer ? await buyerOrders(viewer.id) : [];
  const attempts = orders.some((o) => o.state === 'payment_review') ? (await listAttempts(['submitted']).catch(() => [])).filter((a) => orders.some((o) => o.id === a.orderId)) : [];
  const checking = orders.find((o) => o.state === 'payment_review') ?? null;
  const attempt = checking ? attempts.find((a) => a.orderId === checking.id) : undefined;
  const shown = (tab === 'all' ? orders : orders.filter((o) => orderTab(o.state) === tab)).filter((o) => !q || orderCode(o.id).toLowerCase().includes(q) || o.title.toLowerCase().includes(q));
  const refunded = orders.filter((o) => o.refundedCents > 0 || o.state === 'refunded');
  return (
    <BuyerShell viewer={viewer} active="orders" file="buyer-orders" title={tx('Orders & payments')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Orders & payments'} />
          </h1>
          <div className="tag">
            <T s={'Every purchase, its payment and its receipt'} />
          </div>
        </div>
        <div className="seg" role="tablist" aria-label={tx('Order filter')}>
          {ORDER_TABS.map((t) => (
            <Link key={t} role="tab" className={t === tab ? 'on' : ''} aria-selected={t === tab} href={t === 'all' ? '/dashboard/buyer/orders' : `/dashboard/buyer/orders?tab=${t}`} prefetch={false}>
              {TAB_LABEL[t]}
            </Link>
          ))}
        </div>
      </div>
      {checking && (
        <section className="glass card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', borderColor: '#F0DDB4' }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2>
                <T s={'Payment being verified'} />
              </h2>
              <span className="status st-wait">
                <T s={'Verifying'} />
              </span>
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: 8, lineHeight: 1.55 }}>
              <T
                s={'{v0} · {v1} · {v2}. Our team checks your reference against the bank or wallet statement.'}
                v={{ v0: orderCode(checking.id), v1: plainWords(checking.title), v2: usd(checking.priceCents) }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="status st-ok">
                <T s={'1 · Sent'} />
              </span>
              <span className="status st-wait">
                <T s={'2 · Verifying'} />
              </span>
              <span className="status st-draft">
                <T s={'3 · Confirmed'} />
              </span>
            </div>
          </div>
          <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field">
              <label htmlFor="tx">
                <T s={'Reference you sent'} />
              </label>
              <input id="tx" className="input" value={attempt?.reference ?? '—'} readOnly />
            </div>
            <Link className="btn ghost" href={`/orders/${checking.id}`} prefetch={false}>
              <T s={'Update the reference'} />
            </Link>
          </div>
        </section>
      )}
      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>
                  <T s={'Order'} />
                </th>
                <th>
                  <T s={'Date'} />
                </th>
                <th>
                  <T s={'Item'} />
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
                    <T s={'Receipt'} />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 500 }}>
                      <Link href={`/orders/${o.id}`} prefetch={false}>
                        {orderCode(o.id)}
                      </Link>
                    </td>
                    <td>{shortDate(o.createdAt)}</td>
                    <td>
                      {plainWords(o.title)}
                      <div className="tag">
                        <T s={'Website · {v0}{v1}'} v={{ v0: o.licence ?? 'Standard', v1: o.domain ? ` · ${o.domain.name}` : '' }} />
                      </div>
                    </td>
                    <td>{usd(o.priceCents)}</td>
                    <td>{method(o)}</td>
                    <td>
                      <span className={`status ${TONE[buyerStatus(o.state).tone]}`}>{buyerStatus(o.state).label}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {o.fundedAt ? (
                        <a className="btn sm ghost" href={`/api/orders/${o.id}/receipt`}>
                          <T s={'Receipt PDF'} />
                        </a>
                      ) : (
                        <span className="tag" style={{ margin: 0 }}>
                          <T s={'No payment'} />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    {q ? tx('No order matches that search.') : tx('No orders here yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid2">
        <section className="glass card">
          <h2>
            <T s={'How paying works'} />
          </h2>
          <div className="li" style={{ fontSize: 14 }}>
            <span className="status st-info">
              <T s={'Beta'} />
            </span>
            <span style={{ flex: 1 }}>
              <T s={'Websites are free during the beta; no payment is taken'} />
            </span>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span className="status st-wait">
              <T s={'Bank / wallet'} />
            </span>
            <span style={{ flex: 1 }}>
              <T s={'Send money, enter the reference, we verify it'} />
            </span>
          </div>
          <div className="li" style={{ fontSize: 14 }}>
            <span className="status st-ok">
              <T s={'Escrow'} />
            </span>
            <span style={{ flex: 1 }}>
              <T s={'The seller is paid only after you approve, or after {REVIEW_HOURS} hours'} v={{ REVIEW_HOURS }} />
            </span>
          </div>
        </section>
        <section className="glass card">
          <h2>
            <T s={'Refunds'} />
          </h2>
          {refunded.map((o) => (
            <div key={o.id} className="li" style={{ fontSize: 14 }}>
              <span style={{ flex: 1 }}>
                {plainWords(o.title)} · {usd(o.refundedCents || o.priceCents)}
              </span>
              <span className="status st-ok">
                <T s={'Refunded'} />
              </span>
            </div>
          ))}
          <div className="tag">
            <T s={'Need a refund? Open a ticket from'} />{' '}
            <Link href="/dashboard/buyer/support">
              <T s={'Support & disputes'} />
            </Link>{' '}
            <T s={'while the order is still in review. See the'} />{' '}
            <Link href="/legal/refunds">
              <T s={'refund policy'} />
            </Link>
            .
          </div>
        </section>
      </div>
    </BuyerShell>
  );
}
