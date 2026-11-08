'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/glass/Button';
import { Field } from '@/components/glass/Field';
import { BETA_NOTICE_TEXT } from '@/lib/config';
import { COUNTRIES } from '@/lib/countries';
import { clearCart } from '@/lib/glass/cart';

/* The free beta's payment step: an honest notice and a few questions. There is no card or bank form, and nothing is charged. */
export function BetaForm({ ids, name, email }: { ids: string[]; name: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="g-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const form = Object.fromEntries(new FormData(e.currentTarget));
        const res = await fetch('/api/beta/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, ids }) }).catch(() => null);
        const data = ((await res?.json().catch(() => null)) ?? {}) as { error?: string; orders?: string[] };
        if (res?.ok && data.orders?.length) {
          clearCart();
          router.push(`/checkout/success?order=${data.orders[0]}&n=${data.orders.length}`);
          return;
        }
        setBusy(false);
        setError(data.error ?? 'Could not send your request. Please try again.');
      }}
    >
      <p className="g-pill g-pill-info" style={{ whiteSpace: 'normal', padding: '10px 14px', borderRadius: 14, fontSize: 14 }}>
        {BETA_NOTICE_TEXT}
      </p>
      <Field label="Full name" name="name" required maxLength={100} defaultValue={name} autoComplete="name" />
      <Field label="Email" name="email" type="email" required maxLength={254} defaultValue={email} autoComplete="email" />
      <Field as="select" label="Country" name="country" required defaultValue="" autoComplete="country">
        <option value="" disabled>
          Choose your country
        </option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Field>
      <Field label="Company (optional)" name="company" maxLength={120} autoComplete="organization" />
      <Field as="textarea" label="What will you use it for?" name="useFor" required minLength={3} maxLength={1000} />
      <Field
        label="Domain you want (optional)"
        name="domain"
        maxLength={253}
        placeholder="yourbrand.com"
        hint="We check availability by hand and register it in your own name."
        error={error || undefined}
      />
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending' : 'Send request'}
        </Button>
      </div>
    </form>
  );
}
