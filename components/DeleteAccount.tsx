'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/* Asks the person to type DELETE, then sends the request. The server decides whether it can go ahead. */
export function DeleteAccount() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form
      className="adm-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        const r = await fetch('/api/account/delete-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: text }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setErr(j.error ?? 'Something went wrong.');
        router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="del-confirm">Type DELETE to confirm</label>
        <input id="del-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </div>
      <button className="btn btn-dark btn-sm" type="submit" disabled={busy || text !== 'DELETE'}>
        {busy ? 'One moment...' : 'Ask us to delete my account'}
      </button>
      {err && (
        <p className="form-err" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
