'use client';
import { useState } from 'react';

/* A seller answers a buyer's question. The server runs the chat filter again. */
export function ReplyForm({ id }: { id: string }) {
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

  if (done) return <p className="ask-ok">Reply sent.</p>;
  return (
    <form className="reply-form" onSubmit={send}>
      <label className="sr" htmlFor={`reply-${id}`}>
        Your reply
      </label>
      <textarea id={`reply-${id}`} rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer" />
      {msg && (
        <p className="form-err" role="alert">
          {msg}
        </p>
      )}
      <button className="btn btn-blue btn-sm" type="submit" disabled={busy || text.trim().length < 2}>
        {busy ? 'Sending…' : 'Reply'}
      </button>
    </form>
  );
}
