'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/glass/Button';
import { Field } from '@/components/glass/Field';
import { Turnstile } from '@/components/Turnstile';
import { CONTACT_TOPICS } from '@/lib/contact';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* The contact form for people who are not signed in. The server checks everything again (app/api/contact). */
export function ContactForm({ siteKey }: { siteKey?: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const shown = useRef(Date.now());
  if (state === 'sent')
    return (
      <div role="status">
        <h2>
          <T s={'Message sent'} />
        </h2>
        <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          <T s={'Thanks. We will answer by email.'} />
        </p>
      </div>
    );
  return (
    <form
      style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        setError('');
        const body = Object.fromEntries(new FormData(e.currentTarget));
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, token, elapsedMs: Date.now() - shown.current }),
        }).catch(() => null);
        if (res?.ok) return setState('sent');
        setState('idle');
        setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? tx('Could not send. Please try again.'));
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px, 100%),1fr))', gap: 12 }}>
        <Field label={tx('Name')} name="name" required maxLength={100} autoComplete="name" />
        <Field label={tx('Email')} name="email" type="email" required maxLength={254} autoComplete="email" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px, 100%),1fr))', gap: 12 }}>
        <Field as="select" label={tx('Topic')} name="topic" defaultValue={CONTACT_TOPICS[0]}>
          {CONTACT_TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Field>
        <Field label={tx('Order number (optional)')} name="orderRef" maxLength={40} placeholder={tx('#SB-…')} />
      </div>
      <Field as="textarea" label={tx('Message')} name="message" required minLength={10} maxLength={4000} error={error || undefined} />
      {/* A trap for bots: hidden from people and from screen readers. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />
      <Turnstile siteKey={siteKey} onToken={setToken} />
      <div style={{ alignSelf: 'flex-start' }}>
        <Button type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? tx('Sending') : tx('Send message')}
        </Button>
      </div>
    </form>
  );
}
