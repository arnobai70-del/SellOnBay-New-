'use client';
import { useState } from 'react';
import { COUNTRIES } from '@/lib/countries';
import { Button } from './Button';
import { Field } from './Field';

import { T } from '@/components/i18n/T';
/* Country, phone and company for invoices and domain registration (POST /api/account/details). */
export function DetailsForm({ country, phone, company }: { country: string; phone: string; company: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
  const [error, setError] = useState('');
  return (
    <form
      className="sob-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        setError('');
        const res = await fetch('/api/account/details', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
        }).catch(() => null);
        if (res?.ok) return setState('saved');
        setState('idle');
        const d = ((await res?.json().catch(() => null)) ?? {}) as { error?: string; issues?: { message?: string }[] };
        setError(d.issues?.[0]?.message ?? d.error ?? 'Could not save. Please try again.');
      }}
    >
      <Field as="select" label="Country" name="country" defaultValue={country} autoComplete="country">
        <option value="">
          <T s={'Not set'} />
        </option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Field>
      <Field label="Phone" name="phone" type="tel" defaultValue={phone} placeholder="+44 20 7946 0958" autoComplete="tel" hint="With your country code. Sellers never see it." />
      <Field label="Company (for invoices)" name="company" defaultValue={company} maxLength={120} autoComplete="organization" error={error || undefined} />
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <Button type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Saving' : 'Save details'}
        </Button>
        {state === 'saved' && (
          <span className="tag" role="status">
            <T s={'Saved'} />
          </span>
        )}
      </div>
    </form>
  );
}
