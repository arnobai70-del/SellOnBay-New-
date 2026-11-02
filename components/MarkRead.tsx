'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/* Marks every notification read. The button waits while it works and says so when it could not. */
export function MarkRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <button
        className="btn btn-line btn-sm"
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
        {busy ? 'One moment...' : 'Mark all as read'}
      </button>
      {err && (
        <p className="form-err" role="alert">
          {err}
        </p>
      )}
    </>
  );
}
