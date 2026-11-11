'use client';
import { useState } from 'react';
import { Button } from './Button';
import { Field } from './Field';
import { GlassCard } from './GlassCard';
import { StatusPill } from './StatusPill';

type Props = {
  id: string;
  title: string;
  state: 'beta_requested' | 'beta_approved' | 'beta_declined';
  reason?: string;
  domain?: string;
  reviewed: boolean;
  feedbackDone: boolean;
  subscription?: boolean;
};

/* The buyer's view of a free beta request. There is no payment here to show: only the review by our team, then the files, the domain steps, a review and feedback. */
export function BetaOrderView({ id, title, state, reason, domain, reviewed, feedbackDone, subscription = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(reviewed);
  const files = async () => {
    setBusy(true);
    setNote('');
    const res = await fetch(`/api/orders/${id}/source?json=1`).catch(() => null);
    const data = ((await res?.json().catch(() => null)) ?? {}) as { url?: string; licenseKey?: string; error?: string };
    setBusy(false);
    if (res?.ok && data.url) {
      setNote(data.licenseKey ? `Your licence key: ${data.licenseKey}` : '');
      window.location.assign(data.url);
    } else setNote(data.error ?? 'Could not get your files. Please try again.');
  };
  return (
    <>
      <div className="wrap sob-stack" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div>
          <h1>{title}</h1>
          <div className="row" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <StatusPill tone={state === 'beta_approved' ? 'ok' : state === 'beta_declined' ? 'bad' : 'wait'}>
              {state === 'beta_approved' ? 'Approved' : state === 'beta_declined' ? 'Declined' : 'Waiting for review'}
            </StatusPill>
            <StatusPill tone="info">{subscription ? 'Subscription · included in your plan' : 'Free during beta · no payment taken'}</StatusPill>
          </div>
        </div>
        {state === 'beta_requested' && (
          <GlassCard rise={false}>
            <h2>We&apos;re reviewing your request</h2>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              We&apos;ll email you when it has been reviewed.
            </p>
          </GlassCard>
        )}
        {state === 'beta_declined' && (
          <GlassCard rise={false}>
            <h2>We could not approve this request</h2>
            {reason && (
              <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                {reason}
              </p>
            )}
          </GlassCard>
        )}
        {state === 'beta_approved' && (
          <>
            <GlassCard rise={false}>
              <h2>Your files</h2>
              <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                Each link works for 24 hours, and you can ask for a new one.
              </p>
              <div style={{ marginTop: 14 }}>
                <Button onClick={files} disabled={busy}>
                  {busy ? 'Getting your link' : 'Download files'}
                </Button>
              </div>
              {note && (
                <p className="tag" role="status" style={{ marginTop: 10 }}>
                  {note}
                </p>
              )}
            </GlassCard>
            <GlassCard rise={false}>
              <h2>Your domain</h2>
              <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                {domain
                  ? `You asked for ${domain}. We check it by hand and register it in your own name, then email you the next step.`
                  : 'Use a domain you already own, or find one on our domains page.'}
              </p>
            </GlassCard>
            <GlassCard rise={false}>
              <h2>Your review</h2>
              {done ? (
                <p className="muted" style={{ marginTop: 8, fontSize: 14 }} role="status">
                  Thanks for your review.
                </p>
              ) : (
                <form
                  className="sob-stack"
                  style={{ marginTop: 10 }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const res = await fetch(`/api/demo/orders/${id}/review`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ rating: Number(f.get('rating')), body: String(f.get('body') ?? '') }),
                    }).catch(() => null);
                    if (res?.ok) setDone(true);
                    else setNote(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save your review.');
                  }}
                >
                  <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
                    <legend className="sob-label">Your rating</legend>
                    <div className="row" style={{ justifyContent: 'flex-start' }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <label key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14 }}>
                          <input type="radio" name="rating" value={n} required style={{ width: 18, height: 18 }} /> {n}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field as="textarea" label="Your review (optional)" name="body" maxLength={1000} />
                  <div>
                    <Button type="submit" variant="ghost">
                      Post review
                    </Button>
                  </div>
                </form>
              )}
            </GlassCard>
            {!feedbackDone && !subscription && (
              <GlassCard rise={false} className="row">
                <div>
                  <h2>Tell us how it went</h2>
                  <div className="tag">Two minutes, and only our team reads it.</div>
                </div>
                <Button variant="ghost" href={`/feedback/${id}`}>
                  Give feedback
                </Button>
              </GlassCard>
            )}
          </>
        )}
        <div>
          <Button variant="ghost" href="/dashboard/buyer">
            Back to my dashboard
          </Button>
        </div>
      </div>
    </>
  );
}
