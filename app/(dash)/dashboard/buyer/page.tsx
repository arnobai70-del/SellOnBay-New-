import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { StateChip } from '@/components/StateChip';
import { buyerDashboard } from '@/lib/dashboard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'My orders', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const day = (t?: number) => (t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export default async function BuyerDashboard() {
  const viewer = await requireViewer({ path: '/dashboard/buyer', roles: ['buyer'] });
  const id = await getViewerId();
  const v = id ? await buyerDashboard(id) : null;
  const first = viewer?.name?.split(' ')[0];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="buyer" active="buyer" title={first ? `Welcome back, ${first}` : 'Your orders'}>
      {!supabaseConfigured && <p className="muted">In demo mode there are no accounts, so there is nothing to list here. Each order is reached from its own link, right after you pay.</p>}
      {v?.needsReview.map(({ order, hoursLeft }) => (
        <div className="alert-strip" key={order.id}>
          <span className="pulse" aria-hidden="true" />
          <div>
            <b>{order.title} is ready for your review</b>
            <span>
              {order.domain ? `Check it on ${order.domain.name}. ` : 'Check what the seller delivered. '}It is accepted for you in {hoursLeft} {hoursLeft === 1 ? 'hour' : 'hours'}.
            </span>
          </div>
          <Link className="btn btn-gold btn-sm" href={`/orders/${order.id}`}>
            Review now
          </Link>
        </div>
      ))}

      <div className="strip">
        <div>
          <small>Live sites</small>
          <b>{v?.liveSites ?? 0}</b>
          <span className="d">Accepted with a domain</span>
        </div>
        <div>
          <small>Orders in progress</small>
          <b>{v?.inProgress ?? 0}</b>
          <span className="d" style={{ color: 'var(--amber)' }}>
            {v?.needsReview.length ? `${v.needsReview.length} need your review` : 'Nothing waiting on you'}
          </span>
        </div>
        <div>
          <small>Notifications</small>
          <b>{v?.unread ?? 0}</b>
          <span className="muted" style={{ fontSize: '13.5px' }}>
            <Link href="/notifications">Open them</Link>
          </span>
        </div>
        <div>
          <small>Total spent</small>
          <b>{money(v?.totalSpentCents ?? 0)}</b>
          <span className="muted" style={{ fontSize: '13.5px' }}>
            Across {v?.orders.filter((o) => !!o.fundedAt).length ?? 0} orders
          </span>
        </div>
      </div>

      <div className="dp" id="orders">
        <div className="hd">
          <div>
            <h2>Orders</h2>
            <p className="sub">Accept within 48 hours or the order is accepted for you.</p>
          </div>
          <Link className="btn btn-blue btn-sm" href="/">
            Find another site
          </Link>
        </div>
        {v && v.orders.length === 0 && <p className="muted">No orders yet. When you buy something it shows up here, with its timer and its chat.</p>}
        {v && v.orders.length > 0 && (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="num">Price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {v.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.title}</b>
                      <div className="muted" style={{ fontSize: 14 }}>
                        {o.domain?.name ?? (o.githubUsername ? `GitHub: ${o.githubUsername}` : `Order ${o.id.slice(0, 8).toUpperCase()}`)}
                      </div>
                    </td>
                    <td>
                      <StateChip state={o.state} />
                    </td>
                    <td className="muted">{day(o.acceptedAt ?? o.deliveredAt ?? o.fundedAt ?? o.createdAt)}</td>
                    <td className="num">{money(o.priceCents)}</td>
                    <td>
                      <Link className="btn btn-line btn-sm" href={o.state === 'awaiting_payment' ? `/pay/${o.id}` : `/orders/${o.id}`}>
                        {o.state === 'awaiting_payment' ? 'Pay now' : 'Open'}
                      </Link>{' '}
                      {o.fundedAt && (
                        <Link className="btn btn-line btn-sm" href={`/messages/${o.id}`}>
                          Chat
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {v && v.extras.length > 0 && (
        <div className="dp" id="extra">
          <div className="hd">
            <div>
              <h2>Extra work waiting for you</h2>
              <p className="sub">Sellers send these when you ask for more. Nothing starts until you approve and fund it.</p>
            </div>
          </div>
          <ul className="lst">
            {v.extras.map(({ order, request }) => (
              <li key={request.id}>
                <div className="grow">
                  <b>{request.title}</b>
                  <small>
                    {order.title} · {money(request.priceCents)} · +{request.addDays} {request.addDays === 1 ? 'day' : 'days'}
                  </small>
                </div>
                <Link className="btn btn-gold btn-sm" href={`/orders/${order.id}#orders`}>
                  Approve or decline
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Need something changed?</h2>
            <p className="sub">Ask the seller in the order chat. Anything extra is paid into escrow first, and you approve it before work starts.</p>
          </div>
        </div>
        <p>
          <Link className="btn btn-line btn-sm" href="/messages">
            Open my chats
          </Link>
        </p>
      </div>
    </DashShell>
  );
}
