'use client';
import { useCallback, useEffect, useState } from 'react';

type Channel = 'buyer_admin' | 'admin_seller' | 'internal';
type Msg = { id: string; channel: Channel; senderRole: 'buyer' | 'seller' | 'admin'; body: string; at: number };

const TAB: Record<Channel, string> = { buyer_admin: 'Buyer and SellOnBay', admin_seller: 'SellOnBay and seller', internal: 'Internal notes' };
const MINE: Record<'buyer' | 'seller' | 'admin', string> = { buyer: 'You', seller: 'You', admin: 'SellOnBay' };

/*
 * Messages about one request, order or ticket. Buyers see only their channel with SellOnBay, sellers only theirs; admins see all three and
 * write in the one they pick. The server decides who may read and write (lib/messaging/rules.ts); this only shows what it returns.
 */
export function ConversationPanel({ type, id, me, heading = 'Messages with SellOnBay' }: { type: 'request' | 'order' | 'ticket'; id: string; me: 'buyer' | 'seller' | 'admin'; heading?: string }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [tab, setTab] = useState<Channel | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // loading until the first answer; none: not a conversation this person is part of (the panel stays hidden); failed: say so, never a blank
  const [status, setStatus] = useState<'loading' | 'ready' | 'none' | 'failed'>('loading');

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/conversations/${type}/${id}`, { cache: 'no-store' });
      if (r.status === 404) return setStatus('none');
      if (!r.ok) return setStatus((s) => (s === 'ready' ? s : 'failed')); // keep showing what was read before
      const j = (await r.json()) as { channels: Channel[]; messages: Msg[] };
      setChannels(j.channels);
      setMessages(j.messages);
      setTab((t) => t ?? j.channels[0] ?? null);
      setStatus(j.channels.length ? 'ready' : 'none');
    } catch {
      setStatus((s) => (s === 'ready' ? s : 'failed'));
    }
  }, [type, id]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0); // read after the first paint, not inside the effect
    const t = setInterval(() => void load(), 20_000);
    return () => (clearTimeout(first), clearInterval(t));
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!tab) return;
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/conversations/${type}/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: tab, body: text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? 'Could not send the message. Try again.');
      setText('');
      void load();
    } catch {
      setError('Could not reach SellOnBay. Check your connection and try again; your message is still here.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'none') return null;
  if (status !== 'ready')
    return (
      <div className="glass card sob-sec conv" data-conversation={`${type}:${id}`}>
        <div className="row sob-hd">
          <div>
            <h2>{heading}</h2>
          </div>
        </div>
        {status === 'loading' ? (
          <p className="muted" role="status">
            Loading messages…
          </p>
        ) : (
          <p className="sob-note-box warn" role="alert">
            <span>Could not load your messages just now.</span>{' '}
            <button type="button" className="btn ghost sm" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}
      </div>
    );
  const shown = messages.filter((m) => m.channel === tab);
  const who = (m: Msg) => (m.senderRole === me ? MINE[me] : m.senderRole === 'admin' ? 'SellOnBay' : m.senderRole === 'buyer' ? 'Buyer' : 'Seller');
  return (
    <div className="glass card sob-sec conv" data-conversation={`${type}:${id}`}>
      <div className="row sob-hd">
        <div>
          <h2>{heading}</h2>
          {me !== 'admin' && <p className="tag">SellOnBay handles every message. Please keep contact details and payments on SellOnBay.</p>}
        </div>
      </div>
      {channels.length > 1 && (
        <div className="seg" role="tablist" aria-label="Channel">
          {channels.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={tab === c} className={tab === c ? 'on' : ''} onClick={() => setTab(c)}>
              {TAB[c]}
            </button>
          ))}
        </div>
      )}
      <ul className="conv-list" aria-live="polite">
        {shown.length === 0 && <li className="muted">No messages yet.</li>}
        {shown.map((m) => (
          <li key={m.id} className={m.senderRole === me ? 'mine' : ''}>
            <b>{who(m)}</b>
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
            <small>{new Date(m.at).toLocaleString()}</small>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="conv-form">
        <label htmlFor={`cv-${type}-${id}`} className="hidden-label">
          Your message
        </label>
        <textarea
          id={`cv-${type}-${id}`}
          rows={3}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tab === 'internal' ? 'Only admins see this.' : 'Write your message'}
        />
        <button className="btn sm" type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Sending...' : 'Send'}
        </button>
        {error && (
          <p className="sob-note-box warn" role="alert">
            <span>{error}</span>
          </p>
        )}
      </form>
    </div>
  );
}
