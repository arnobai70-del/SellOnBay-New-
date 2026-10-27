'use client';
import { useState } from 'react';

/* Asks for a short download link to a released revision file and opens it. The server checks the release gate every time. */
export function RevisionDownload({ orderId, revisionId }: { orderId: string; revisionId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/orders/${orderId}/revisions/${revisionId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'link' }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) setErr(j.error ?? 'Could not get the link. Try again.');
      else window.location.assign(j.url);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="btn btn-line btn-sm" onClick={go} disabled={busy}>
        {busy ? 'Getting the link...' : 'Download the revised files'}
      </button>
      {err && (
        <span className="form-err" role="alert">
          {' '}
          {err}
        </span>
      )}
    </span>
  );
}
