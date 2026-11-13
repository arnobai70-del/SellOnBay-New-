'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/*
 * The chat of one order. New messages arrive by polling every few seconds, and instantly when Supabase Realtime tells us (signed-in people only; the
 * row-level policy decides who gets each change). The server filters every message: contact details, links and outside payments never get through.
 */
type Msg = { id: string; role: 'buyer' | 'seller'; body: string; at: number };

export function OrderChat({ endpoint, orderId, me, open, live }: { endpoint: string; orderId: string; me: 'buyer' | 'seller'; open: boolean; live: boolean }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    let j: { messages: Msg[] };
    try {
      const r = await fetch(`${endpoint}?since=${last.current}`, { cache: 'no-store' });
      if (!r.ok) return setErr(tx('Could not load the messages. They come back when you reload the page.'));
      j = await r.json();
    } catch {
      return setErr(tx('Could not reach SellOnBay to load the messages. Check your connection.'));
    }
    setErr('');
    if (!j.messages.length) return;
    last.current = Math.max(last.current, ...j.messages.map((m) => m.at));
    setMsgs((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      return [...cur, ...j.messages.filter((m) => !seen.has(m.id))];
    });
  }, [endpoint]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0); // read after the first paint, not inside the effect
    if (!open) return () => clearTimeout(first); // a closed (read-only) chat gets no new messages: read it once, do not keep asking
    const t = setInterval(() => void load(), 4000);
    return () => (clearTimeout(first), clearInterval(t));
  }, [load, open]);

  useEffect(() => {
    if (!live || !open) return;
    const sb = createClient();
    const ch = sb
      .channel(`order:${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, () => void load())
      .subscribe();
    return () => void sb.removeChannel(ch);
  }, [live, open, orderId, load]);

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
    let r: Response;
    try {
      r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: sending }) });
    } catch {
      setBusy(false);
      setText((cur) => cur || sending);
      return setErr(tx('Could not reach SellOnBay. Check your connection and try again.'));
    }
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setText((cur) => cur || sending); // give the text back so it can be edited
      return setErr(j.error ?? tx('Could not send that.'));
    }
    await load();
  }

  return (
    <section className="sob-chat2" aria-label={tx('Messages about this order')} id="messages">
      <h2>
        <T s={'Messages'} />
      </h2>
      <p className="muted sob-chat2-safe">
        <T s={'Keep it here. Emails, phone numbers, links and paying outside SellOnBay are blocked, so both of you stay protected.'} />
      </p>
      <div className="sob-chat2-list" ref={box} role="log" aria-live="polite">
        {msgs.length === 0 && (
          <p className="muted">
            <T s={'No messages yet. Say hello.'} />
          </p>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={'sob-chat2-msg ' + (m.role === me ? 'me' : 'them')}>
            <small>
              {m.role === me ? tx('You') : m.role === 'seller' ? tx('Seller') : tx('Buyer')} · {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
      {open ? (
        <form onSubmit={send} className="sob-chat2-form">
          <label className="hidden-label" htmlFor={`chat-${orderId}`}>
            <T s={'Your message'} />
          </label>
          <textarea id={`chat-${orderId}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={tx('Write a message')} />
          <button className="btn sm" type="submit" disabled={busy || !text.trim()}>
            {busy ? tx('Sending...') : tx('Send')}
          </button>
        </form>
      ) : (
        <p className="muted">
          <T s={'This chat is read only. Write to SellOnBay in Messages with SellOnBay instead.'} />
        </p>
      )}
      {err && (
        <p className="sob-err" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}
