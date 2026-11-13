'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
import { T } from '@/components/i18n/T';
/* A buyer or seller opens a support ticket with SellOnBay (/api/tickets). The server checks the words (no contact details) and who may see it. */
export function TicketForm({ base, orders }: { base: string; orders: { id: string; title: string }[] }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [orderId, setOrderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/tickets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, body, orderId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? 'Could not open the ticket.');
    router.push(`${base}?t=${j.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={send} data-ticket-form style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2>
          <T s={'New ticket'} />
        </h2>
        <div className="tag">
          <T s={'Ask SellOnBay. Your money stays in escrow while a problem is open.'} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="tk-subject">
          <T s={'Subject'} />
        </label>
        <input id="tk-subject" className="input" required minLength={3} maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      {orders.length > 0 && (
        <div className="field">
          <label htmlFor="tk-order">
            <T s={'About an order (optional)'} />
          </label>
          <select id="tk-order" className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">
              <T s={'Not about one order'} />
            </option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="tk-body">
          <T s={'Your question'} />
        </label>
        <textarea id="tk-body" className="input" required maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tx('Write it here…')} />
      </div>
      <div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? tx('Sending...') : tx('Open ticket')}
        </button>
      </div>
      {error && (
        <p className="tag" role="alert" style={{ margin: 0, color: '#7A2E24' }}>
          {error}
        </p>
      )}
    </form>
  );
}
