import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { ConversationPanel } from '@/components/ConversationPanel';
import { AdminShell } from '@/components/glass/AdminShell';
import { listReports } from '@/lib/admin/queue';
import { DAY_MS } from '@/lib/config';
import { REASON_LABEL, adminOverdue, evidenceOf, openDisputes, sellerOverdue, type Dispute } from '@/lib/disputes';
import { profileNames } from '@/lib/glass/admin';
import { usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { split } from '@/lib/ledger';
import { listTickets, type Ticket } from '@/lib/messaging/store';
import { getOrder, orderEvents } from '@/lib/orders/service';
import { orderCode } from '@/lib/payments/rules';
import { listRefunds } from '@/lib/payments/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Disputes and support', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['all', 'All'],
  ['disputes', 'Disputes'],
  ['refunds', 'Refunds'],
  ['questions', 'Questions'],
] as const;
type Tab = (typeof TABS)[number][0];
const ago = (t: number, now: number) => {
  const h = Math.round((now - t) / 3_600_000);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const BOX: React.CSSProperties = { padding: 14, borderRadius: 14, background: 'rgba(255,255,255,.7)', border: '1px solid #DCE7EC', display: 'flex', flexDirection: 'column', gap: 8 };

type Item = { key: string; title: string; kind: 'Dispute' | 'Refund' | 'Question' | 'Seller'; tone: string; sub: string; at: number; href: string };

/*
 * design-reference/admin-support.html: one inbox of disputes, refund requests and tickets, and the open one beside it. A dispute keeps the money
 * in escrow until it is decided (the decision form posts to /api/admin/disputes/[id]/decide); a ticket is answered in its conversation and its
 * status is set with /api/tickets/[id]. Abuse reports have their own tool.
 */
export default async function AdminSupportHub({ searchParams }: { searchParams: Promise<{ tab?: string; d?: string; t?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/support', roles: ['admin'], scope: 'support' });
  const sp = await searchParams;
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'all';
  const now = Date.now();
  const [disputes, tickets, reports, refunds] = await Promise.all([openDisputes(), listTickets(), listReports(true), listRefunds({ statuses: ['requested', 'approved'] })]);
  const names = await profileNames(tickets.map((t) => t.openedBy));
  const items: Item[] = [
    ...(tab === 'all' || tab === 'disputes'
      ? disputes.map((d) => ({
          key: `d:${d.id}`,
          title: REASON_LABEL[d.reason],
          kind: 'Dispute' as const,
          tone: 'st-bad',
          sub: `${orderCode(d.orderId)} · ${ago(d.createdAt, now)}`,
          at: d.createdAt,
          href: `/admin/support?${tab !== 'all' ? `tab=${tab}&` : ''}d=${d.id}`,
        }))
      : []),
    ...(tab === 'all' || tab === 'refunds'
      ? refunds.map((r) => ({
          key: `r:${r.id}`,
          title: `Refund ${usd(r.amountCents)}: ${r.reason}`,
          kind: 'Refund' as const,
          tone: 'st-wait',
          sub: `${orderCode(r.orderId)} · ${r.status}`,
          at: 0,
          href: '/admin/orders#refunds',
        }))
      : []),
    ...(tab === 'all' || tab === 'questions'
      ? tickets
          .filter((t) => t.status !== 'closed')
          .map((t) => ({
            key: `t:${t.id}`,
            title: t.subject,
            kind: t.openerRole === 'seller' ? ('Seller' as const) : ('Question' as const),
            tone: t.openerRole === 'seller' ? 'st-draft' : 'st-info',
            sub: `${t.orderId ? orderCode(t.orderId) : 'Account'} · ${names.get(t.openedBy) ?? 'user'} · ${ago(t.updatedAt, now)}`,
            at: t.updatedAt,
            href: `/admin/support?${tab !== 'all' ? `tab=${tab}&` : ''}t=${t.id}`,
          }))
      : []),
  ];
  const dispute = sp.d ? (disputes.find((d) => d.id === sp.d) ?? null) : !sp.t ? (disputes[0] ?? null) : null;
  const ticket: Ticket | null = !dispute && sp.t ? (tickets.find((t) => t.id === sp.t) ?? null) : !dispute && !sp.d ? (tickets.find((t) => t.status !== 'closed') ?? null) : null;
  const monthFrom = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const closedMonth = tickets.filter((t) => t.status === 'closed' && t.updatedAt >= monthFrom).length;
  return (
    <AdminShell viewer={viewer} active="support" file="admin-support" title={tx('Disputes & support')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Disputes & support'} />
          </h1>
          <div className="tag">
            <T s={'Buyer problems during the review, refund requests and questions. A dispute keeps the money in escrow until it is decided.'} />
          </div>
        </div>
        <div className="seg" role="tablist" aria-label={tx('Ticket type')}>
          {TABS.map(([k, l]) => (
            <Link key={k} role="tab" className={k === tab ? 'on' : ''} aria-selected={k === tab} href={k === 'all' ? '/admin/support' : `/admin/support?tab=${k}`} prefetch={false}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Open disputes'} />
          </div>
          <div className="v">{disputes.length}</div>
          <div className="s">{disputes.filter((d) => adminOverdue(d, now)).length ? `${disputes.filter((d) => adminOverdue(d, now)).length} past our deadline` : 'Escrow on hold'}</div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Open tickets'} />
          </div>
          <div className="v">{tickets.filter((t) => t.status === 'open').length}</div>
          <div className="s">
            {tickets.filter((t) => t.status === 'waiting_user').length} <T s={'waiting for the person'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Abuse reports'} />
          </div>
          <div className="v">{reports.length}</div>
          <div className="s">
            <Link href="/admin/support/abuse" prefetch={false}>
              <T s={'Review reports'} />
            </Link>
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Resolved this month'} />
          </div>
          <div className="v">{closedMonth}</div>
          <div className="s">
            <T s={'Tickets closed'} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <aside className="glass" style={{ flex: '1 1 280px', maxWidth: 360, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }} aria-label={tx('Tickets')}>
          {items.length ? (
            items.map((i) => (
              <Link key={i.key} className={(dispute && i.key === `d:${dispute.id}`) || (ticket && i.key === `t:${ticket.id}`) ? 'tk on' : 'tk'} href={i.href} prefetch={false}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b style={{ fontWeight: 500 }}>{i.title}</b>
                  <span className={`status ${i.tone}`}>{i.kind}</span>
                </span>
                <span className="tag" style={{ display: 'block' }}>
                  {i.sub}
                </span>
              </Link>
            ))
          ) : (
            <p className="muted" style={{ margin: 10, fontSize: 14 }}>
              <T s={'Nothing is waiting here.'} />
            </p>
          )}
        </aside>
        <section className="glass card" style={{ flex: '999 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {dispute ? (
            <DisputeView d={dispute} now={now} />
          ) : ticket ? (
            <>
              <div className="row">
                <div>
                  <h2>{ticket.subject}</h2>
                  <div className="tag">
                    <T
                      s={'{v0}{openerRole} {v2} · opened {v3}'}
                      v={{ v0: ticket.orderId ? `${orderCode(ticket.orderId)} · ` : '', openerRole: ticket.openerRole, v2: names.get(ticket.openedBy) ?? 'user', v3: when(ticket.createdAt) }}
                    />
                  </div>
                </div>
                <span className={`status ${ticket.openerRole === 'seller' ? 'st-draft' : 'st-info'}`}>{ticket.openerRole === 'seller' ? 'Seller' : 'Question'}</span>
              </div>
              <ConversationPanel type="ticket" id={ticket.id} me="admin" heading="Messages" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {ticket.orderId && (
                  <Link className="btn ghost" href={`/admin/orders/${ticket.orderId}`} prefetch={false}>
                    <T s={'Open the order'} />
                  </Link>
                )}
                <AdminForm
                  endpoint={`/api/tickets/${ticket.id}`}
                  openLabel="Change status"
                  submit="Save"
                  tone="line"
                  fields={[
                    {
                      name: 'status',
                      label: 'Status',
                      kind: 'select',
                      options: [
                        ['open', 'Waiting for SellOnBay'],
                        ['waiting_user', 'Waiting for the person'],
                        ['closed', 'Closed'],
                      ],
                    },
                  ]}
                />
                <span style={{ flex: 1 }} />
                <Link className="btn ghost" href="/admin/support/tickets" prefetch={false}>
                  <T s={'All tickets, closed too'} />
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2>
                <T s={'Nothing open'} />
              </h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                <T s={'No dispute or ticket is waiting.'} />{' '}
                <Link href="/admin/support/tickets">
                  <T s={'See every ticket'} />
                </Link>{' '}
                <T s={'or'} />{' '}
                <Link href="/admin/support/abuse">
                  <T s={'the abuse reports'} />
                </Link>
                .
              </p>
            </>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

/* The open dispute: the review window, what each side said, the evidence and the decision (the old disputes tool, in the design's pane). */
async function DisputeView({ d, now }: { d: Dispute; now: number }) {
  const o = await getOrder(d.orderId);
  const [ev, history, people] = await Promise.all([evidenceOf(d.id), o ? orderEvents(o.id) : Promise.resolve([]), profileNames([o?.buyerId, o?.sellerId])]);
  const sellerNet = o ? split(o.lines, o.feeCents, o.sellerGrossCents).sellerNet : 0;
  const left = d.adminDueAt - now;
  const span = Math.max(1, d.adminDueAt - d.createdAt);
  const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
  return (
    <>
      <div className="row">
        <div>
          <h2>{REASON_LABEL[d.reason]}</h2>
          <div className="tag">
            <T
              s={'{v0} · {v1} · buyer {v2} · seller {v3} · opened from {fromState}'}
              v={{ v0: orderCode(d.orderId), v1: plainWords(o?.title ?? 'Order'), v2: people.get(o?.buyerId ?? '') ?? '—', v3: people.get(o?.sellerId ?? '') ?? '—', fromState: d.fromState }}
            />
          </div>
        </div>
        <span className="status st-bad">
          <T s={'Dispute'} />
        </span>
      </div>
      <div style={BOX}>
        <div className="row" style={{ fontSize: 14 }}>
          <span>
            <T s={'Our decision is due'} />
          </span>
          <span className={`status ${left < DAY_MS ? 'st-bad' : 'st-wait'}`}>{left > 0 ? `${Math.round(left / 3_600_000)}h left` : 'Late'}</span>
        </div>
        <div className="bar">
          <i style={{ width: `${Math.round(Math.min(1, Math.max(0, 1 - left / span)) * 100)}%`, background: '#D9A08F' }} />
        </div>
        <div className="tag" style={{ margin: 0 }}>
          <T s={'{v0} · the seller is paid only after this is resolved{v1}'} v={{ v0: o ? `${usd(o.priceCents)} held` : 'Held', v1: sellerOverdue(d, now) ? ' · the seller reply is late' : '' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="msg buyer">
          <div className="tag" style={{ margin: '0 0 4px' }}>
            <T s={'{v0} (buyer) · {v1}'} v={{ v0: people.get(o?.buyerId ?? '') ?? 'Buyer', v1: when(d.createdAt) }} />
          </div>
          {d.detail}
        </div>
        {d.sellerReply && (
          <div className="msg seller">
            <div className="tag" style={{ margin: '0 0 4px' }}>
              <T s={'{v0} (seller){v1}'} v={{ v0: people.get(o?.sellerId ?? '') ?? 'Seller', v1: d.sellerRepliedAt ? ` · ${when(d.sellerRepliedAt)}` : '' }} />
            </div>
            {d.sellerReply}
          </div>
        )}
        {ev.map((e) => (
          <div key={e.id} className="msg note">
            <div className="tag" style={{ margin: '0 0 4px' }}>
              <T s={'Evidence · {v0}'} v={{ v0: when(e.at) }} />
            </div>
            {e.text}
          </div>
        ))}
      </div>
      {history.length > 0 && (
        <details>
          <summary className="tag">
            <T s={'Order history ({length})'} v={{ length: history.length }} />
          </summary>
          {history.map((h, i) => (
            <div key={i} className="tag">
              {when(h.at)} · {h.event.replace(/_/g, ' ')}
            </div>
          ))}
        </details>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <AdminForm
          endpoint={`/api/admin/disputes/${d.id}/decide`}
          openLabel="Decide"
          submit="Save decision"
          tone="blue"
          fields={[
            {
              name: 'decision',
              label: 'Decision',
              kind: 'select',
              options: [
                ['refund_full', 'Refund the buyer in full'],
                ['refund_partial', 'Refund part of it'],
                ['fix_requested', 'Ask the seller to fix it'],
                ['release', 'Reject the dispute and pay the seller'],
              ],
            },
            {
              name: 'refundCents',
              label: `Refund amount in dollars (up to ${money(sellerNet)}, taken from the seller's share)`,
              kind: 'dollars',
              showWhen: { field: 'decision', equals: 'refund_partial' },
            },
            {
              name: 'liability',
              label: 'Whose fault was it? (recorded on the dispute)',
              kind: 'select',
              options: [
                ['platform', 'Us or nobody'],
                ['seller', 'The seller'],
                ['buyer_fraud', 'The buyer (fraud): the buyer is flagged'],
              ],
            },
            { name: 'feeCents', label: 'What the dispute cost, in dollars (empty for none). Taken from the seller only when the seller was at fault.', kind: 'dollars' },
            { name: 'note', label: 'Note (both sides see the decision; keep contact details out)', kind: 'textarea' },
          ]}
        />
        <Link className="btn ghost" href={`/orders/${d.orderId}`} prefetch={false}>
          <T s={'Open the order page'} />
        </Link>
        <a className="btn ghost" href={`/api/orders/${d.orderId}/evidence`} download>
          <T s={'Evidence file (PDF)'} />
        </a>
      </div>
    </>
  );
}
