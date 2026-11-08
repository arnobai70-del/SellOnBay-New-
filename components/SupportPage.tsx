import Link from 'next/link';
import { ActionButton } from './ActionButton';
import { ConversationPanel } from './ConversationPanel';
import { TicketForm } from './TicketForm';
import type { Ticket } from '@/lib/messaging/store';

const WORD: Record<Ticket['status'], [string, string]> = { open: ['Waiting for SellOnBay', 'st-wait'], waiting_user: ['SellOnBay answered', 'st-info'], closed: ['Closed', 'st-draft'] };
const ago = (t: number, now: number) => {
  const h = Math.round((now - t) / 3_600_000);
  return h < 1 ? 'just now' : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/*
 * The support inbox of design-reference/buyer-support.html and seller-support.html: the person's tickets beside the open one, its messages and
 * reply (/api/conversations), closing it (/api/tickets/[id]) and a new ticket (/api/tickets). Server component.
 */
export function SupportPage({
  me,
  base,
  tickets,
  open,
  orders,
  newTicket,
  now,
}: {
  me: 'buyer' | 'seller';
  base: string;
  tickets: Ticket[];
  open: Ticket | null;
  orders: { id: string; title: string }[];
  newTicket?: boolean;
  now: number;
}) {
  const shown = open ?? (newTicket ? null : (tickets.find((t) => t.status !== 'closed') ?? null));
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <aside className="glass" style={{ flex: '1 1 260px', maxWidth: 340, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }} aria-label="My tickets">
        {tickets.length ? (
          tickets.map((t) => (
            <Link key={t.id} className={shown?.id === t.id ? 'tk on' : 'tk'} href={`${base}?t=${t.id}`} prefetch={false}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontWeight: 500 }}>{t.subject}</b>
                <span className={`status ${WORD[t.status][1]}`}>{WORD[t.status][0]}</span>
              </span>
              <span className="tag" style={{ display: 'block' }}>
                {t.orderId ? (orders.find((o) => o.id === t.orderId)?.title ?? 'An order') : 'Account'} · {ago(t.updatedAt, now)}
              </span>
            </Link>
          ))
        ) : (
          <p className="muted" style={{ margin: 10, fontSize: 14 }}>
            No tickets yet.
          </p>
        )}
      </aside>
      <section className="glass card" style={{ flex: '999 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }} data-ticket={shown?.id}>
        {shown ? (
          <>
            <div className="row">
              <div>
                <h2>{shown.subject}</h2>
                <div className="tag">Opened {new Date(shown.createdAt).toUTCString().slice(0, 16)} · SellOnBay handles every message; keep contact details and payments on SellOnBay</div>
              </div>
              <span className={`status ${WORD[shown.status][1]}`}>{WORD[shown.status][0]}</span>
            </div>
            {shown.orderId && (
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.7)', border: '1px solid #DCE7EC', fontSize: 14 }} className="row">
                <span>{me === 'buyer' ? 'Your money stays in escrow while a problem is open' : 'The buyer’s money stays in escrow while this is open'}</span>
                <Link className="btn sm ghost" href={`/orders/${shown.orderId}`} prefetch={false}>
                  Open the order
                </Link>
              </div>
            )}
            <ConversationPanel
              type="ticket"
              id={shown.id}
              me={me}
              bare
              actions={
                shown.status !== 'closed' && (
                  <>
                    <span style={{ flex: 1 }} />
                    <ActionButton
                      endpoint={`/api/tickets/${shown.id}`}
                      body={{ status: 'closed' }}
                      label="Close this ticket"
                      tone="line"
                      confirm="Close it if your question is answered. You can open a new one at any time."
                    />
                  </>
                )
              }
            />
          </>
        ) : (
          <TicketForm base={base} orders={orders} />
        )}
      </section>
    </div>
  );
}
