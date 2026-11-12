'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
/* "Edit target" on the admin overview (design-reference/admin.html): saves the monthly sales target in the shop settings (Super Admin, audited). */
export function TargetForm({ dollars }: { dollars: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(dollars ? String(dollars) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!open)
    return (
      <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}>
        <T s={'Edit target'} />
      </button>
    );
  return (
    <form
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg('');
        const r = await fetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ monthlyTargetCents: Number(value || 0), reason: 'Monthly target changed on the overview' }),
        }).catch(() => null);
        setBusy(false);
        if (r?.ok) {
          setOpen(false);
          router.refresh();
        } else setMsg(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save. Try again.');
      }}
    >
      <label className="hidden-label" htmlFor="target-usd">
        <T s={'Monthly target in US dollars'} />
      </label>
      <input id="target-usd" className="input" inputMode="decimal" placeholder="e.g. 2000" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} style={{ width: 130 }} />
      <button className="btn sm" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button className="btn sm ghost" type="button" onClick={() => setOpen(false)}>
        <T s={'Cancel'} />
      </button>
      {msg && (
        <span role="alert" className="tag" style={{ color: '#7A2E24', margin: 0 }}>
          {msg}
        </span>
      )}
    </form>
  );
}
