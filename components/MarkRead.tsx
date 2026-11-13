'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
/* Marks every notification read. The button waits while it works and says so when it could not. */
export function MarkRead() {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <button
        className="btn ghost"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr('');
          try {
            const r = await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'all' }) });
            if (!r.ok) setErr('Could not mark them as read. Try again.');
            else router.refresh();
          } catch {
            setErr('Could not reach SellOnBay. Check your connection and try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? tx('One moment...') : tx('Mark all read')}
      </button>
      {err && (
        <p className="tag" style={{ color: '#7A2E24' }} role="alert">
          {err}
        </p>
      )}
    </>
  );
}
