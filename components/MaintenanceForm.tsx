'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/* One module's maintenance switch in the Maintenance Manager. The server checks and records everything; this only collects the choice. */
const local = (ms: number | null) => {
  if (!ms) return '';
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); // datetime-local wants the viewer's own time
};
const iso = (v: string) => (v ? new Date(v).toISOString() : null);

export function MaintenanceForm({
  module,
  label,
  enabled,
  message,
  startAt,
  endAt,
  max,
  othersClosed,
}: {
  module: string;
  label: string;
  enabled: boolean;
  message: string;
  startAt: number | null;
  endAt: number | null;
  max: number;
  othersClosed: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [text, setText] = useState(message);
  const [start, setStart] = useState(local(startAt));
  const [end, setEnd] = useState(local(endAt));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    // A second question before a change that closes a lot at once, or the admin dashboard itself.
    if (on && !enabled) {
      if (module === 'admin' && !confirm('Close the admin dashboard? Only this Maintenance Manager and the audit log stay open.')) return;
      if (othersClosed >= 4 && !confirm(`${othersClosed} other parts are already in maintenance. Close ${label} as well?`)) return;
    }
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module, enabled: on, message: text, startAt: iso(start), endAt: iso(end) }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setMsg({ ok: true, text: on ? 'Saved. This part is now in maintenance (or will be at the start time).' : 'Saved. This part is open again.' });
    router.refresh();
  }

  const id = (s: string) => `mm-${module}-${s}`;
  return (
    <form className="mm-form" onSubmit={send}>
      <label className="mm-switch" htmlFor={id('on')}>
        <input id={id('on')} type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Under maintenance
      </label>
      <label htmlFor={id('msg')}>Message visitors see (empty = the standard words)</label>
      <textarea id={id('msg')} rows={2} maxLength={max} value={text} onChange={(e) => setText(e.target.value)} />
      <small className="muted">
        {text.length}/{max}
      </small>
      <div className="mm-times">
        <span>
          <label htmlFor={id('start')}>Start (optional, your time)</label>
          <input id={id('start')} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </span>
        <span>
          <label htmlFor={id('end')}>End (optional; it opens again by itself)</label>
          <input id={id('end')} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </span>
      </div>
      <button className="btn btn-dark btn-sm" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {msg && (
        <p className={msg.ok ? 'adm-ok' : 'form-err'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
