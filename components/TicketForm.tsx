'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/* A buyer or seller opens a support ticket with SellOnBay. The server checks the words (no contact details) and who may see the ticket. */
export function TicketForm({ base, orders }: { base: string; orders: { id: string; title: string }[] }) {
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
    <form className="req-sec" onSubmit={send} data-ticket-form>
      <h2>Ask SellOnBay</h2>
      <label htmlFor="tk-subject">Subject</label>
      <input id="tk-subject" required minLength={3} maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} />
      {orders.length > 0 && (
        <>
          <label htmlFor="tk-order">About an order (optional)</label>
          <select id="tk-order" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Not about one order</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor="tk-body">Your question</label>
      <textarea id="tk-body" required rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn btn-blue btn-sm" type="submit" disabled={busy}>
        {busy ? 'Sending...' : 'Open ticket'}
      </button>
      {error && (
        <p className="note warn" role="alert">
          <span>{error}</span>
        </p>
      )}
    </form>
  );
}
