'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* Changes the person's own name. The server checks the name and saves it with their own session (POST /api/account/profile). */
export function ProfileForm({ name }: { name: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [text, setText] = useState(name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const clean = text.trim();
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setErr('');
        setSaved(false);
        try {
          const r = await fetch('/api/account/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: clean }) });
          const j = (await r.json().catch(() => ({}))) as { error?: string; name?: string };
          if (!r.ok) return setErr(j.error ?? tx('Could not save your name. Try again.'));
          setText(j.name ?? clean);
          setSaved(true);
          router.refresh(); // the menu and the greeting show the new name
        } catch {
          setErr(tx('Could not reach SellOnBay. Check your connection and try again.'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="pf-name">
          <T s={'Your name'} />
        </label>
        <input id="pf-name" className="input" value={text} onChange={(e) => (setText(e.target.value), setSaved(false))} maxLength={80} autoComplete="name" required />
      </div>
      <button className="btn sm" type="submit" disabled={busy || clean.length < 2 || clean === name}>
        {busy ? tx('Saving...') : tx('Save')}
      </button>
      {saved && (
        <p className="tag" style={{ margin: 0 }} role="status">
          <T s={'Saved.'} />
        </p>
      )}
      {err && (
        <p className="tag" style={{ margin: 0, color: '#7A2E24' }} role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
