'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/*
 * One small form for admin actions: sends JSON to an admin API route, shows the answer in plain words, refreshes the page.
 * The server decides everything; this only collects the words.
 */
export type Field = {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'select' | 'dollars' | 'checkbox';
  options?: [value: string, label: string][];
  required?: boolean;
  hint?: string;
  /* What the field starts with (text fields), and a character limit shown as a live count. */
  value?: string;
  max?: number;
  /* Shown only when another field has this value. Plain data, so the page (a server component) can pass it. */
  showWhen?: { field: string; equals: string };
};

export function AdminForm({
  endpoint,
  fields,
  submit,
  tone = 'blue',
  fixed = {},
  open = false,
  openLabel,
}: {
  endpoint: string;
  fields: Field[];
  submit: string;
  tone?: 'blue' | 'dark' | 'gold' | 'line';
  fixed?: Record<string, unknown>;
  open?: boolean;
  openLabel?: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(open);
  const [v, setV] = useState<Record<string, string | boolean>>(() => Object.fromEntries(fields.map((f) => [f.name, f.kind === 'checkbox' ? false : (f.value ?? f.options?.[0]?.[0] ?? '')])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!shown)
    return (
      <button className={'btn btn-' + (tone === 'line' ? 'line' : tone) + ' btn-sm'} type="button" onClick={() => setShown(true)}>
        {openLabel ?? submit}
      </button>
    );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      if (f.showWhen && v[f.showWhen.field] !== f.showWhen.equals) continue;
      body[f.name] = f.kind === 'dollars' ? Math.round(Number(v[f.name]) * 100) : v[f.name];
    }
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setMsg({ ok: true, text: 'Done.' });
    router.refresh();
  }

  return (
    <form className="adm-form" onSubmit={send}>
      {fields.map((f) => {
        if (f.showWhen && v[f.showWhen.field] !== f.showWhen.equals) return null;
        const id = `${endpoint}-${f.name}`;
        const set = (x: string | boolean) => setV((p) => ({ ...p, [f.name]: x }));
        return f.kind === 'checkbox' ? (
          <label key={f.name} className="adm-check">
            <input type="checkbox" checked={!!v[f.name]} onChange={(e) => set(e.target.checked)} />
            <span>{f.label}</span>
          </label>
        ) : (
          <div className="field" key={f.name}>
            <label htmlFor={id}>{f.label}</label>
            {f.kind === 'textarea' ? (
              <textarea id={id} rows={2} value={String(v[f.name])} onChange={(e) => set(e.target.value)} required={f.required} maxLength={f.max ?? 600} />
            ) : f.kind === 'select' ? (
              <select id={id} value={String(v[f.name])} onChange={(e) => set(e.target.value)}>
                {f.options?.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={f.kind === 'dollars' ? 'number' : 'text'}
                step={f.kind === 'dollars' ? '0.01' : undefined}
                min={f.kind === 'dollars' ? '0.01' : undefined}
                value={String(v[f.name])}
                onChange={(e) => set(e.target.value)}
                required={f.required}
                maxLength={f.max ?? 200}
              />
            )}
            {(f.hint || f.max) && (
              <small>
                {f.hint}
                {f.max ? `${f.hint ? ' ' : ''}${String(v[f.name]).length} / ${f.max}` : ''}
              </small>
            )}
          </div>
        );
      })}
      <div className="adm-btns">
        <button className={'btn btn-' + (tone === 'line' ? 'line' : tone) + ' btn-sm'} type="submit" disabled={busy}>
          {busy ? 'One moment...' : submit}
        </button>
        {!open && (
          <button className="btn btn-line btn-sm" type="button" onClick={() => setShown(false)}>
            Cancel
          </button>
        )}
      </div>
      {msg && (
        <p className={msg.ok ? 'adm-ok' : 'form-err'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
