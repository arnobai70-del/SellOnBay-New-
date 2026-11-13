'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
import { T } from '@/components/i18n/T';
type Row = { provider: string; label: string; since: string | null; linked: boolean; available: boolean };

/* The account's sign-in methods with Link and Remove (app/api/account/links). The server decides everything; this only sends the choice. */
export function SignInMethods({ rows, canLink }: { rows: Row[]; canLink: boolean }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function send(action: 'link' | 'unlink', provider: string) {
    setBusy(provider);
    setMsg(null);
    const r = await fetch('/api/account/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, provider }) });
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy('');
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    if (j.url) return window.location.assign(j.url);
    setMsg({ ok: true, text: 'Removed.' });
    router.refresh();
  }
  return (
    <div>
      <ul className="sob-list" data-signin-methods>
        {rows.map((r) => (
          <li key={r.provider}>
            <div className="sob-grow">
              <b>{r.label}</b>{' '}
              {r.linked ? (
                <span className="muted">
                  <T s={'· linked{v0}'} v={{ v0: r.since ? ` since ${r.since}` : '' }} />
                </span>
              ) : (
                <span className="muted">
                  <T s={'· not linked'} />
                </span>
              )}
            </div>
            {r.linked && r.provider !== 'email' ? (
              <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => send('unlink', r.provider)}>
                {busy === r.provider ? tx('Removing...') : tx('Remove')}
              </button>
            ) : !r.linked && canLink && r.available ? (
              <button type="button" className="btn sm" disabled={!!busy} onClick={() => send('link', r.provider)}>
                {busy === r.provider ? tx('Opening...') : tx('Link')}
              </button>
            ) : !r.linked ? (
              <small className="muted">
                <T s={'Not available yet'} />
              </small>
            ) : null}
          </li>
        ))}
      </ul>
      {msg && (
        <p className={msg.ok ? 'note' : 'note warn'} role={msg.ok ? 'status' : 'alert'}>
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}
