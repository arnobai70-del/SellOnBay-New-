'use client';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { Turnstile } from './Turnstile';

export type Asked = { id: string; body: string; reply: string | null; created_at: string };

/* Ask the seller a question before buying. Contact details and outside payments are blocked on the server, so we say so up front. */
export function AskSeller({ productKey, signedIn, history }: { productKey: string; signedIn: boolean; history: Asked[] }) {
  const [text, setText] = useState('');
  const [token, setToken] = useState('');
  const [hp, setHp] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState('');
  const [items, setItems] = useState(history);
  const started = useRef(Date.now());
  const onToken = useCallback((t: string) => setToken(t), []);

  if (!signedIn)
    return (
      <p className="muted">
        <Link className="link-u" href={`/login?next=${encodeURIComponent('/product/' + productKey)}`}>
          Sign in
        </Link>{' '}
        to ask the seller a question before you buy.
      </p>
    );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (text.trim().length < 5) return setErr('Write a little more so the seller can help.');
    if (!token) return setErr('Wait for the bot check to finish, then send again.');
    setState('busy');
    const res = await fetch('/api/presale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productKey, body: text.trim(), token, hp, startedAt: started.current }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setState('idle');
      return setErr(body.error ?? 'Something went wrong. Try again.');
    }
    setItems((l) => [{ id: body.id ?? String(Date.now()), body: text.trim(), reply: null, created_at: new Date().toISOString() }, ...l]);
    setText('');
    setState('sent');
    started.current = Date.now();
  }

  return (
    <div className="ask">
      <form onSubmit={send} noValidate>
        <label htmlFor="ask-body" className="sr">
          Your question for the seller
        </label>
        <textarea
          id="ask-body"
          rows={3}
          maxLength={500}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (state === 'sent') setState('idle');
          }}
          placeholder="Does it work with my setup? What exactly is in the files?"
        />
        <div className="ask-hp" aria-hidden="true">
          <label>
            Leave this empty
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
        </div>
        <p className="ask-note">Keep emails, phone numbers, links and payments on SellOnBay so you both stay protected. Messages with them are not sent.</p>
        <Turnstile onToken={onToken} />
        {err && (
          <p className="form-err" role="alert">
            {err}
          </p>
        )}
        {state === 'sent' && (
          <p className="ask-ok" role="status">
            Sent. The seller will reply here.
          </p>
        )}
        <button className="btn btn-blue" type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Sending…' : 'Send question'}
        </button>
      </form>
      {items.length > 0 && (
        <ul className="ask-list" aria-label="Your questions">
          {items.map((q) => (
            <li key={q.id}>
              <b>You asked</b>
              <p>{q.body}</p>
              {q.reply ? (
                <div className="ask-reply">
                  <b>Seller replied</b>
                  <p>{q.reply}</p>
                </div>
              ) : (
                <small>Waiting for the seller</small>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
