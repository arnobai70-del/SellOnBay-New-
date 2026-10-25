'use client';
import Link from 'next/link';
import { useState } from 'react';

/* Ask for the seller's limited trial copy before buying. The server decides (sign-in, once a week, a one-hour link). */
export function TrialCopy({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'ready'>('idle');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  if (!signedIn)
    return (
      <p className="muted">
        <Link className="link-u" href={`/login?next=${encodeURIComponent('/product/' + slug)}`}>
          Sign in
        </Link>{' '}
        to try a limited copy before you buy.
      </p>
    );
  async function ask() {
    setState('busy');
    setErr('');
    const r = await fetch(`/api/products/${encodeURIComponent(slug)}/trial`, { method: 'POST' });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) {
      setState('idle');
      return setErr(b.error ?? 'Could not get the trial.');
    }
    setUrl(b.url);
    setState('ready');
  }
  return (
    <div className="trialbox">
      <b>Try a limited copy first</b>
      <p className="muted">A cut-down version from the seller, so you can see it run. One trial per product each week.</p>
      {state === 'ready' ? (
        <a className="btn btn-blue btn-sm" href={url}>
          Download the trial
        </a>
      ) : (
        <button className="btn btn-line btn-sm" type="button" disabled={state === 'busy'} onClick={ask}>
          {state === 'busy' ? 'One moment…' : 'Get the trial'}
        </button>
      )}
      {err && (
        <p className="form-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
