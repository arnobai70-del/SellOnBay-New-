'use client';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* A seller answers a buyer's question. The server runs the chat filter again. */
export function ReplyForm({ id }: { id: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/presale/reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, reply: text.trim() }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(body.error ?? 'Could not send the reply.');
    setDone(true);
  }

  if (done)
    return (
      <p className="tag" style={{ margin: 0 }}>
        <T s={'Reply sent.'} />
      </p>
    );
  return (
    <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <label className="hidden-label" htmlFor={`reply-${id}`}>
        <T s={'Your reply'} />
      </label>
      <textarea id={`reply-${id}`} className="input" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder={tx('Write your answer')} />
      {msg && (
        <p className="tag" style={{ margin: 0, color: '#7A2E24' }} role="alert">
          {msg}
        </p>
      )}
      <button className="btn sm" type="submit" disabled={busy || text.trim().length < 2}>
        {busy ? 'Sending…' : 'Reply'}
      </button>
    </form>
  );
}
