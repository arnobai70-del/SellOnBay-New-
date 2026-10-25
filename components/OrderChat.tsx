'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/*
 * The chat of one order. New messages arrive by polling every few seconds, and instantly when Supabase Realtime tells us (signed-in people only; the
 * row-level policy decides who gets each change). The server filters every message: contact details, links and outside payments never get through.
 */
type Msg = { id: string; role: 'buyer' | 'seller'; body: string; at: number };

export function OrderChat({ endpoint, orderId, me, open, live }: { endpoint: string; orderId: string; me: 'buyer' | 'seller'; open: boolean; live: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${endpoint}?since=${last.current}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j: { messages: Msg[] } = await r.json();
    if (!j.messages.length) return;
    last.current = Math.max(last.current, ...j.messages.map((m) => m.at));
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      return [...cur, ...j.messages.filter((m) => !seen.has(m.id))];
    });
  }, [endpoint]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const sb = createClient();
    const ch = sb
      .channel(`order:${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, () => void load())
      .subscribe();
    return () => void sb.removeChannel(ch);
  }, [live, orderId, load]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const sending = text;
    if (!sending.trim() || busy) return;
    setBusy(true);
    setErr('');
    setText(''); // cleared at once, so what is typed next is never wiped by a slow answer
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: sending }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setText((cur) => cur || sending); // give the text back so it can be edited
      return setErr(j.error ?? 'Could not send that.');
    }
    await load();
  }

  return (
    <section className="chat2" aria-label="Messages about this order" id="messages">
      <h2>Messages</h2>
      <p className="muted chat2-safe">Keep it here. Emails, phone numbers, links and paying outside {'SellOnBay'} are blocked, so both of you stay protected.</p>
      <div className="chat2-list" ref={box} role="log" aria-live="polite">
        {msgs.length === 0 && <p className="muted">No messages yet. Say hello.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={'chat2-msg ' + (m.role === me ? 'me' : 'them')}>
            <small>
              {m.role === me ? 'You' : m.role === 'seller' ? 'Seller' : 'Buyer'} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
      {open ? (
        <form onSubmit={send} className="chat2-form">
          <label className="sr-only" htmlFor={`chat-${orderId}`}>
            Your message
          </label>
          <textarea id={`chat-${orderId}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Write a message" />
          <button className="btn btn-blue btn-sm" type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Sending...' : 'Send'}
          </button>
        </form>
      ) : (
        <p className="muted">This chat is closed.</p>
      )}
      {err && (
        <p className="form-err" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
