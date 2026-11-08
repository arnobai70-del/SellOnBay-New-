'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COUNTRIES } from '@/lib/countries';
import { Button } from './Button';
import { Field } from './Field';
import { Switch } from './Switch';

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const data = ((await res?.json().catch(() => null)) ?? {}) as { error?: string; issues?: { message?: string }[]; next?: string };
  return { ok: !!res?.ok, error: data.issues?.[0]?.message ?? data.error ?? 'Could not save. Please try again.', next: data.next };
};

/* "Offer this website free during beta" on one listing. */
export function BetaSwitch({ slug, name, on }: { slug: string; name: string; on: boolean }) {
  const [value, setValue] = useState(on);
  const [error, setError] = useState('');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Switch
        label={`Offer ${name} free during beta`}
        checked={value}
        onChange={async (next) => {
          setValue(next);
          setError('');
          const r = await post('/api/seller/listings/beta', { slug, on: next });
          if (!r.ok) {
            setValue(!next);
            setError(r.error);
          }
        }}
      />
      <span className="g-tag" role={error ? 'alert' : undefined}>
        {error || (value ? 'On' : 'Off')}
      </span>
    </span>
  );
}

/* "Switch to selling" for a buyer: the account becomes a seller that can still buy, then the seller pages ask for the authenticator code. */
export function SellSwitch() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await post('/api/account/sell', {});
          if (r.ok) router.push(r.next ?? '/dashboard/seller');
          else {
            setBusy(false);
            setError(r.error);
          }
        }}
      >
        {busy ? 'Switching' : 'Switch to selling'}
      </Button>
      {error && (
        <div className="g-field-e" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

export type StoreValues = { username: string; headline: string; bio: string; skills: string[]; customAvailable: boolean; replyTime: string; storePaused: boolean };
export function StoreForm({ initial }: { initial: StoreValues }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
  const [error, setError] = useState('');
  return (
    <form
      className="g-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        setError('');
        const r = await post('/api/seller/store', v);
        setState(r.ok ? 'saved' : 'idle');
        if (!r.ok) setError(r.error);
      }}
    >
      <Field
        label="Store name (your address)"
        value={v.username}
        onChange={(e) => setV({ ...v, username: e.target.value })}
        hint="sellonbay.com/sellers/your-name. Letters, numbers and dashes."
        maxLength={40}
      />
      <Field label="Headline" value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} maxLength={120} placeholder="Frontend developer · Next.js & React" />
      <Field as="textarea" label="About" value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={1000} />
      <Field
        label="Skills (comma separated, up to 8)"
        value={v.skills.join(', ')}
        onChange={(e) =>
          setV({
            ...v,
            skills: e.target.value
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 8),
          })
        }
      />
      <Field as="select" label="Usual reply time shown to buyers" value={v.replyTime} onChange={(e) => setV({ ...v, replyTime: e.target.value })}>
        <option value="">Not shown</option>
        <option>Within a few hours</option>
        <option>Within 24 hours</option>
        <option>Within 2 days</option>
      </Field>
      <div className="g-li">
        <span style={{ flex: 1 }}>Show &ldquo;Available for customization&rdquo;</span>
        <Switch label="Available for customization" checked={v.customAvailable} onChange={(on) => setV({ ...v, customAvailable: on })} />
      </div>
      <div className="g-li">
        <span style={{ flex: 1 }}>Pause my store (vacation)</span>
        <Switch label="Pause my store" checked={v.storePaused} onChange={(on) => setV({ ...v, storePaused: on })} />
      </div>
      {error && (
        <div className="g-field-e" role="alert">
          {error}
        </div>
      )}
      <div className="g-row" style={{ justifyContent: 'flex-start' }}>
        <Button type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Saving' : 'Save profile'}
        </Button>
        {state === 'saved' && (
          <span className="g-tag" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}

/* The government ID upload (passport, national ID or driver licence, and the country). */
export function VerificationForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="g-stack"
      encType="multipart/form-data"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const res = await fetch('/api/seller/verification', { method: 'POST', body: new FormData(e.currentTarget) }).catch(() => null);
        if (res?.ok) return router.refresh();
        setBusy(false);
        setError((((await res?.json().catch(() => null)) ?? {}) as { error?: string }).error ?? 'Could not send. Please try again.');
      }}
    >
      <Field as="select" label="Kind of ID" name="docType" defaultValue="passport">
        <option value="passport">Passport</option>
        <option value="national_id">National ID card</option>
        <option value="driver_licence">Driver licence</option>
      </Field>
      <Field as="select" label="Country that issued it" name="country" defaultValue="" required>
        <option value="" disabled>
          Choose a country
        </option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Field>
      <Field label="Front (picture or PDF, up to 5 MB)" name="front" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required />
      <Field label="Back (if your ID has one)" name="back" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" error={error || undefined} />
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending' : 'Send for verification'}
        </Button>
      </div>
    </form>
  );
}
