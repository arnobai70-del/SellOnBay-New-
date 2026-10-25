import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { REASON_LABEL, adminOverdue, evidenceOf, openDisputes, sellerOverdue } from '@/lib/disputes';
import { split } from '@/lib/ledger';
import { getOrder, orderEvents } from '@/lib/orders/service';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Disputes', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const when = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function Disputes() {
  const viewer = await requireViewer({ path: '/dashboard/admin/disputes', roles: ['admin'] });
  const list = await openDisputes();
  const now = Date.now();
  const cards = await Promise.all(
    list.map(async (d) => {
      const o = await getOrder(d.orderId);
      return { d, o, ev: await evidenceOf(d.id), history: o ? await orderEvents(o.id) : [] };
    }),
  );
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-disputes" title="Disputes">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Open disputes</h2>
            <p className="sub">The seller replies within 48 hours. You decide within 5 days. Payment for the order is held until then. Read the evidence and the order history first.</p>
          </div>
        </div>
        {cards.length === 0 && <p className="muted">No open disputes.</p>}
        {cards.map(({ d, o, ev, history }) => {
          const sellerNet = o ? split(o.lines, o.feeCents).sellerNet : 0;
          return (
            <div className="adm-card" key={d.id}>
              <h3>
                {o?.title ?? 'Order'} · {REASON_LABEL[d.reason]}
              </h3>
              <div className="meta">
                <span>Order {d.orderId.slice(0, 8).toUpperCase()}</span>
                <span>{o ? money(o.priceCents) : ''}</span>
                <span>opened from {d.fromState}</span>
                <span>{when(d.createdAt)}</span>
                {sellerOverdue(d, now) && <span className="chip rose">Seller reply is late</span>}
                {adminOverdue(d, now) && <span className="chip rose">Decision is late</span>}
                {d.status === 'seller_replied' && <span className="chip mint">Seller replied</span>}
              </div>
              <p>
                <b>Buyer:</b> {d.detail}
              </p>
              {d.sellerReply && (
                <p>
                  <b>Seller:</b> {d.sellerReply}
                </p>
              )}
              {ev.length > 0 && (
                <details>
                  <summary>Evidence ({ev.length})</summary>
                  <ul className="ord-log">
                    {ev.map((e) => (
                      <li key={e.id}>
                        <span>{when(e.at)}</span> {e.text}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {history.length > 0 && (
                <details>
                  <summary>Order history ({history.length})</summary>
                  <ul className="ord-log">
                    {history.map((h, i) => (
                      <li key={i}>
                        <span>{when(h.at)}</span> {h.event.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <AdminForm
                endpoint={`/api/admin/disputes/${d.id}/decide`}
                openLabel="Decide"
                submit="Save decision"
                tone="gold"
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
                  {
                    name: 'feeCents',
                    label: 'What the dispute cost, in dollars (for example the payment provider fee; empty for none). Taken from the seller only when the seller was at fault.',
                    kind: 'dollars',
                  },
                  { name: 'note', label: 'Note (both sides see the decision; keep contact details out)', kind: 'textarea' },
                ]}
              />
              <small className="muted">
                <Link href={`/orders/${d.orderId}`}>Open the order page</Link> ·{' '}
                <a href={`/api/orders/${d.orderId}/evidence`} download>
                  Download the evidence file (PDF)
                </a>
              </small>
            </div>
          );
        })}
      </div>
    </DashShell>
  );
}
