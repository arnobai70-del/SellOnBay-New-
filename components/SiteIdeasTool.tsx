'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { Turnstile } from './Turnstile';

type Out = {
  ideas: { title: string; why: string }[];
  names: { name: string; domain: string; status: 'available' | 'taken' | 'unknown' }[];
  products: { id: string; name: string; price: number; tag: string }[];
  cached: boolean;
  live: boolean;
  left: number;
  source: 'templates' | 'model';
};

/* One line in, five site ideas, ten domain names and three ready-made sites out. The server does all the checking; this only shows it. */
export function SiteIdeasTool() {
  const [idea, setIdea] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [out, setOut] = useState<Out | null>(null);
  const [round, setRound] = useState(0);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setOut(null);
    try {
      const r = await fetch('/api/tools/site-ideas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea, token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(j.error ?? 'Something went wrong. Try again.');
      setOut(j);
    } catch {
      setErr('The idea helper is unavailable right now. Please try again later.');
    } finally {
      setBusy(false);
      if (token) {
        setToken('');
        setRound((n) => n + 1); // a Turnstile token works once
      }
    }
  }

  return (
    <div>
      <form onSubmit={run} className="panel" style={{ maxWidth: 680 }}>
        <div className="field" style={{ marginTop: 0 }}>
          <label htmlFor="idea">Your business or idea, in one line</label>
          <input
            id="idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            required
            minLength={3}
            maxLength={140}
            placeholder="A bakery in Dhaka that sells cakes and bread"
            autoComplete="off"
          />
          <small>No personal details needed. The same idea gives the same answer.</small>
          <p className="muted" style={{ marginTop: 8 }}>
            Suggestions currently use predefined templates, not a live AI model. Domain names are unverified ideas, not available domains.
          </p>
        </div>
        <Turnstile key={round} onToken={setToken} />
        <button className="btn btn-blue" type="submit" disabled={busy || idea.trim().length < 3 || !token} style={{ marginTop: 12 }}>
          {busy ? 'Thinking...' : 'Give me ideas'}
        </button>
        {!token && (
          <small className="muted" style={{ marginLeft: 10 }}>
            Checking that you are a person...
          </small>
        )}
        {err && (
          <p className="form-err" role="alert">
            {err}
          </p>
        )}
      </form>

      {out && (
        <div className="siteideas-out" aria-live="polite">
          <p className="muted">
            {out.source === 'templates' ? 'Generated from predefined suggestion templates (not a live AI model). ' : 'Generated using an AI model. '}
            {out.cached ? 'Same idea as before, so this answer was free. ' : ''}
            {out.left} free {out.left === 1 ? 'run' : 'runs'} left today.
          </p>
          <h2>5 pages your site should have</h2>
          <ol className="siteideas-list">
            {out.ideas.map((i) => (
              <li key={i.title}>
                <b>{i.title}</b>
                <span>{i.why}</span>
              </li>
            ))}
          </ol>
          <h2>10 domain names to try</h2>
          <ul className="siteideas-names">
            {out.names.map((n) => (
              <li key={n.name}>
                <b>{n.domain}</b>
                {n.status === 'available' && <span className="chip mint">Available</span>}
                {n.status === 'taken' && <span className="chip rose">Taken</span>}
                {n.status === 'unknown' && (
                  <Link className="chip" href={`/domains?name=${encodeURIComponent(n.name)}`}>
                    View domain ideas (unverified)
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <h2>Ready-made sites that fit</h2>
          <ul className="siteideas-products">
            {out.products.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.id}`}>
                  <b>{p.name}</b>
                </Link>
                <span>
                  {p.tag}
                  {SHOW_LIST_PRICES && <> · ${p.price}</>}
                </span>
              </li>
            ))}
          </ul>
          <p>
            <Link className="btn btn-gold" href={`/browse?q=${encodeURIComponent(idea.split(' ').slice(0, 3).join(' '))}`}>
              See more sites like this
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
