'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Row = { key: string; label: string; locked: boolean };

/* Shows, hides and reorders the category-bar entries. Hidden entries keep their pages; the server saves and refreshes every page. */
export function NavEditor({ rows, hidden, order }: { rows: Row[]; hidden: string[]; order: string[] }) {
  const router = useRouter();
  const start = [...rows].sort((a, b) => (order.indexOf(a.key) < 0 ? 999 : order.indexOf(a.key)) - (order.indexOf(b.key) < 0 ? 999 : order.indexOf(b.key)));
  const [list, setList] = useState(order.length ? start : rows);
  const [off, setOff] = useState<string[]>(hidden);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const move = (i: number, d: number) => {
    const to = i + d;
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    [next[i], next[to]] = [next[to], next[i]];
    setList(next);
  };
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/seo/nav', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hidden: off, order: list.map((x) => x.key) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setMsg({ ok: true, text: 'Saved. The top bar follows within a minute.' });
    router.refresh();
  }
  return (
    <div className="adm-form">
      {list.map((x, i) => (
        <div className="adm-card" key={x.key}>
          <label className="adm-check">
            <input type="checkbox" checked={!off.includes(x.key)} disabled={x.locked} onChange={(e) => setOff((p) => (e.target.checked ? p.filter((k) => k !== x.key) : [...p, x.key]))} />
            <span>
              {x.label}
              {x.locked ? ' (always shown)' : ''}
            </span>
          </label>
          <div className="adm-btns">
            <button className="btn btn-line btn-sm" type="button" onClick={() => move(i, -1)} disabled={i === 0}>
              Move up
            </button>
            <button className="btn btn-line btn-sm" type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
              Move down
            </button>
          </div>
        </div>
      ))}
      <div className="adm-btns">
        <button className="btn btn-dark btn-sm" type="button" disabled={busy} onClick={save}>
          {busy ? 'One moment...' : 'Save the top bar'}
        </button>
      </div>
      {msg && (
        <p className={msg.ok ? 'ok' : 'err'} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
