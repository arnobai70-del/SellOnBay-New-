'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/*
 * One button (with an optional short note) that posts a small JSON action and then refreshes or goes to a page the server names.
 * Used for buyer actions on requests and quotations. The server decides everything; this only sends the choice.
 */
export function ActionButton({
  endpoint,
  body,
  label,
  busyLabel = 'One moment...',
  tone = 'blue',
  note,
  confirm,
  goTo,
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  tone?: 'blue' | 'line' | 'dark';
  note?: { label: string; required?: boolean; rows?: number };
  confirm?: string;
  goTo?: (json: Record<string, unknown>) => string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const needsStep = !!note || !!confirm;

  async function go() {
    if (busy) return;
    setBusy(true);
    setMsg('');
    let r: Response;
    try {
      r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ...(note ? { note: text } : {}) }) });
    } catch {
      setBusy(false);
      return setMsg('Could not reach SellOnBay. Check your connection and try again.');
    }
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? 'Something went wrong. Try again.');
    const to = goTo?.(j);
    if (to) router.push(to);
    else {
      setOpen(false);
      setText('');
      router.refresh();
    }
  }

  if (needsStep && !open)
    return (
      <button type="button" className={`btn btn-${tone} btn-sm`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="act-step">
      {confirm && <p className="muted">{confirm}</p>}
      {note && (
        <>
          <label htmlFor={`ab-${label}`}>{note.label}</label>
          <textarea id={`ab-${label}`} rows={note.rows ?? 3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
        </>
      )}
      <div className="act-row">
        <button type="button" className={`btn btn-${tone} btn-sm`} disabled={busy || (!!note?.required && text.trim().length < 2)} onClick={go}>
          {busy ? busyLabel : label}
        </button>
        {needsStep && (
          <button type="button" className="btn btn-line btn-sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
      {msg && (
        <p className="note warn" role="alert">
          <span>{msg}</span>
        </p>
      )}
    </div>
  );
}
