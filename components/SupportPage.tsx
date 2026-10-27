import Link from 'next/link';
import { ActionButton } from './ActionButton';
import { ConversationPanel } from './ConversationPanel';
import { TicketForm } from './TicketForm';
import type { Ticket } from '@/lib/messaging/store';

const WORD: Record<Ticket['status'], [string, string]> = { open: ['Waiting for SellOnBay', 'chip amber'], waiting_user: ['SellOnBay answered', 'chip mint'], closed: ['Closed', 'chip'] };

/* The support page of a buyer or a seller: their tickets, one open ticket's messages, and a form for a new one. Server component. */
export function SupportPage({ me, base, tickets, open, orders }: { me: 'buyer' | 'seller'; base: string; tickets: Ticket[]; open: Ticket | null; orders: { id: string; title: string }[] }) {
  return (
    <>
      {open && (
        <div data-ticket={open.id}>
          <ConversationPanel type="ticket" id={open.id} me={me} heading={open.subject} />
          {open.status !== 'closed' && (
            <div className="dp">
              <ActionButton
                endpoint={`/api/tickets/${open.id}`}
                body={{ status: 'closed' }}
                label="Close this ticket"
                tone="line"
                confirm="Close it if your question is answered. You can open a new one at any time."
              />
            </div>
          )}
        </div>
      )}
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Your tickets</h2>
          </div>
        </div>
        {tickets.length === 0 && <p className="muted">No tickets yet.</p>}
        <ul className="lst">
          {tickets.map((t) => (
            <li key={t.id}>
              <div className="grow">
                <b>
                  <Link href={`${base}?t=${t.id}`}>{t.subject}</Link>
                </b>
                <small>Opened {new Date(t.createdAt).toUTCString().slice(0, 16)}</small>
              </div>
              <span className={WORD[t.status][1]}>
                <i />
                {WORD[t.status][0]}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <TicketForm base={base} orders={orders} />
    </>
  );
}
