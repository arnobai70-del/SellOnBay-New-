'use client';
import { useState } from 'react';
import { Button } from '@/components/glass/Button';
import { Field } from '@/components/glass/Field';

import { T } from '@/components/i18n/T';
export function FeedbackForm({ orderId, reviewHref }: { orderId: string; reviewHref: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  if (state === 'done')
    return (
      <div role="status">
        <h2>
          <T s={'Thank you'} />
        </h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          <T s={'Your answers go straight to our team. Would you also leave a public review for other buyers?'} />
        </p>
        <div style={{ marginTop: 14 }}>
          <Button href={reviewHref}>
            <T s={'Leave a review'} />
          </Button>
        </div>
      </div>
    );
  return (
    <form
      className="sob-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        setError('');
        const res = await fetch(`/api/beta/${orderId}/feedback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
        }).catch(() => null);
        if (res?.ok) return setState('done');
        setState('idle');
        setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not send. Please try again.');
      }}
    >
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="sob-label">
          <T s={'How would you rate it?'} />
        </legend>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14 }}>
              <input type="radio" name="rating" value={n} required style={{ width: 18, height: 18 }} /> {n}
            </label>
          ))}
        </div>
      </fieldset>
      <Field as="textarea" label="What worked?" name="worked" maxLength={2000} />
      <Field as="textarea" label="What should we improve?" name="improve" maxLength={2000} error={error || undefined} />
      <div>
        <Button type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Sending' : 'Send feedback'}
        </Button>
      </div>
    </form>
  );
}
