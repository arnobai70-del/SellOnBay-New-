'use client';
import { useCallback, useEffect, useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
type Channel = 'buyer_admin' | 'admin_seller' | 'internal';
type Msg = { id: string; channel: Channel; senderRole: 'buyer' | 'seller' | 'admin'; body: string; at: number };

const TAB: Record<Channel, string> = { buyer_admin: 'Buyer and SellOnBay', admin_seller: 'SellOnBay and seller', internal: 'Internal notes' };
const MINE: Record<'buyer' | 'seller' | 'admin', string> = { buyer: 'You', seller: 'You', admin: 'SellOnBay' };

/*
 * Messages about one request, order or ticket. Buyers see only their channel with SellOnBay, sellers only theirs; admins see all three and
 * write in the one they pick. The server decides who may read and write (lib/messaging/rules.ts); this only shows what it returns.
 */
export function ConversationPanel({
  type,
  id,
  me,
  heading = 'Messages with SellOnBay',
  bare = false,
  actions,
}: {
  type: 'request' | 'order' | 'ticket';
  id: string;
  me: 'buyer' | 'seller' | 'admin';
  heading?: string;
  bare?: boolean;
  /* More buttons beside Send (the design's reply row). */
  actions?: React.ReactNode;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
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
  // bare: inside a design pane (support inbox, order page) without a card of its own. A plain tag, so the form is never remounted while typing.
  const Box = bare ? 'div' : 'section';
  const boxProps = { className: bare ? undefined : 'glass card', style: { display: 'flex', flexDirection: 'column' as const, gap: 12 }, 'data-conversation': `${type}:${id}` };
  if (status !== 'ready')
    return (
      <Box {...boxProps}>
        {!bare && <h2>{heading}</h2>}
        {status === 'loading' ? (
          <p className="muted" role="status" style={{ margin: 0, fontSize: 14 }}>
            <T s={'Loading messages…'} />
          </p>
        ) : (
          <p className="tag" role="alert" style={{ margin: 0 }}>
            <T s={'Could not load your messages just now.'} />{' '}
            <button type="button" className="btn ghost sm" onClick={() => void load()}>
              <T s={'Try again'} />
            </button>
          </p>
        )}
      </Box>
    );
  const shown = messages.filter((m) => m.channel === tab);
  const who = (m: Msg) => (m.senderRole === me ? MINE[me] : m.senderRole === 'admin' ? 'SellOnBay support' : m.senderRole === 'buyer' ? 'Buyer' : 'Seller');
  // The design's bubbles: mine on one side, the other person on the other, SellOnBay (and internal notes) across.
  const bubble = (m: Msg) => (m.channel === 'internal' ? 'msg note' : m.senderRole === me ? 'msg me' : m.senderRole === 'admin' ? 'msg team' : 'msg them');
  return (
    <Box {...boxProps}>
      {!bare && (
        <div>
          <h2>{heading}</h2>
          {me !== 'admin' && (
            <div className="tag">
              <T s={'SellOnBay handles every message. Please keep contact details and payments on SellOnBay.'} />
            </div>
          )}
        </div>
      )}
      {channels.length > 1 && (
        <div className="seg" role="tablist" aria-label={tx('Reply type')} style={{ alignSelf: 'flex-start' }}>
          {channels.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={tab === c} className={tab === c ? 'on' : ''} onClick={() => setTab(c)}>
              {TAB[c]}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-live="polite">
        {shown.length === 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            <T s={'No messages yet.'} />
          </p>
        )}
        {shown.map((m) => (
          <div key={m.id} className={bubble(m)}>
            <div className="tag" style={{ margin: '0 0 4px' }}>
              {m.channel === 'internal' ? 'Internal note · ' : ''}
              {who(m)} · {new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
          </div>
        ))}
      </div>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="field">
          <label htmlFor={`cv-${type}-${id}`}>{tab === 'internal' ? 'Internal note' : me === 'admin' ? 'Reply' : 'Your reply'}</label>
          <textarea
            id={`cv-${type}-${id}`}
            className="input"
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tab === 'internal' ? 'Only admins see this.' : 'Write a reply…'}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" type="submit" disabled={busy || !text.trim()}>
            {busy ? 'Sending...' : 'Send'}
          </button>
          {actions}
        </div>
        {error && (
          <p className="tag" role="alert" style={{ margin: 0, color: '#7A2E24' }}>
            {error}
          </p>
        )}
      </form>
    </Box>
  );
}
