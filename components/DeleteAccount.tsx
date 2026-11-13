'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
import { T } from '@/components/i18n/T';
/* Asks the person to type DELETE, then sends the request. The server decides whether it can go ahead. */
export function DeleteAccount() {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form
      className="sob-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setErr('');
        let r: Response;
        try {
          r = await fetch('/api/account/delete-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: text }) });
        } catch {
          setBusy(false);
          return setErr(tx('Could not reach SellOnBay. Check your connection and try again.'));
        }
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return setErr(j.error ?? tx('Something went wrong. Try again.'));
        router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="del-confirm">
          <T s={'Type DELETE to confirm'} />
        </label>
        <input id="del-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </div>
      <button className="btn warn sm" type="submit" disabled={busy || text !== 'DELETE'}>
        {busy ? tx('One moment...') : tx('Ask us to delete my account')}
      </button>
      {err && (
        <p className="sob-err" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
