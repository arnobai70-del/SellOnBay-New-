'use client';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
/* Asks for a short download link to a released revision file and opens it. The server checks the release gate every time. */
export function RevisionDownload({ orderId, revisionId }: { orderId: string; revisionId: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
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
      <button type="button" className="btn ghost sm" onClick={go} disabled={busy}>
        {busy ? tx('Getting the link...') : tx('Download the revised files')}
      </button>
      {err && (
        <span className="sob-err" role="alert">
          {' '}
          {err}
        </span>
      )}
    </span>
  );
}
