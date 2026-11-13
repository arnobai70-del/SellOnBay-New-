'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Language } from '@/lib/i18n/config';

import { useTx } from '@/components/i18n/TxProvider';
import { T } from '@/components/i18n/T';
import { tx } from '@/lib/i18n/tx';
/* Admin › Language Management forms (owner, 2026-11-12), all through POST /api/admin/languages. */
async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/languages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return { ok: !!r?.ok, error: j?.error ?? (r ? '' : tx('No connection. Please try again.')) }; // shown through <T>, so it is translated
}
const Msg = ({ text, bad }: { text: string; bad?: boolean }) =>
  text ? (
    <p role={bad ? 'alert' : 'status'} className="tag" style={{ margin: 0, color: bad ? '#7A2E24' : undefined }}>
      <T s={text} />
    </p>
  ) : null;

/* The language list: on/off, published, order, names, direction, default; add a language; remove one an admin added. */
export function LanguagesForm({ initial, defaultLang, builtin }: { initial: Language[]; defaultLang: string; builtin: string[] }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [list, setList] = useState<Language[]>(initial);
  const [def, setDef] = useState(defaultLang);
  const [add, setAdd] = useState({ code: '', name: '', native: '', dir: 'ltr' as 'ltr' | 'rtl' });
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);
  const up = (code: string, patch: Partial<Language>) => setList(list.map((l) => (l.code === code ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setList(next.map((l, n) => ({ ...l, order: n })));
  };
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const turningOn = list.filter((l) => l.published && !initial.find((x) => x.code === l.code)?.published).map((l) => l.name);
        if (turningOn.length && !window.confirm(tx('Publish {v0}? Visitors will be able to choose it, and its pages get their own addresses.', { v0: turningOn.join(', ') }))) return;
        const r = await post({ action: 'languages', settings: { defaultLang: def, languages: list } });
        setBad(!r.ok);
        setMsg(r.ok ? tx('Saved. It applies now.') : r.error || tx('Could not save.'));
        if (r.ok) router.refresh();
      }}
    >
      <div className="tbl" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>
                <T s={'Order'} />
              </th>
              <th>
                <T s={'Code'} />
              </th>
              <th>
                <T s={'Name'} />
              </th>
              <th>
                <T s={'Shown as'} />
              </th>
              <th>
                <T s={'Direction'} />
              </th>
              <th>
                <T s={'On'} />
              </th>
              <th>
                <T s={'Published'} />
              </th>
              <th>
                <T s={'Default'} />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((l, i) => (
              <tr key={l.code}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn sm ghost" aria-label={tx('Move {name} up', { name: l.name })} onClick={() => move(i, -1)} disabled={i === 0}>
                    <T s={'Up'} />
                  </button>{' '}
                  <button type="button" className="btn sm ghost" aria-label={tx('Move {name} down', { name: l.name })} onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                    <T s={'Down'} />
                  </button>
                </td>
                <td>{l.code}</td>
                <td>
                  <input aria-label={`${l.code} name`} className="input" value={l.name} maxLength={40} onChange={(e) => up(l.code, { name: e.target.value })} style={{ minWidth: 110 }} />
                </td>
                <td>
                  <input aria-label={`${l.code} shown as`} className="input" value={l.native} maxLength={40} onChange={(e) => up(l.code, { native: e.target.value })} style={{ minWidth: 110 }} />
                </td>
                <td>
                  <select aria-label={`${l.code} direction`} className="input" value={l.dir} onChange={(e) => up(l.code, { dir: e.target.value === 'rtl' ? 'rtl' : 'ltr' })} disabled={l.code === 'en'}>
                    <option value="ltr">
                      <T s={'Left to right'} />
                    </option>
                    <option value="rtl">
                      <T s={'Right to left'} />
                    </option>
                  </select>
                </td>
                <td>
                  <input aria-label={`${l.code} on`} type="checkbox" checked={l.enabled} disabled={l.code === 'en'} onChange={(e) => up(l.code, { enabled: e.target.checked })} />
                </td>
                <td>
                  <input aria-label={`${l.code} published`} type="checkbox" checked={l.published} disabled={l.code === 'en'} onChange={(e) => up(l.code, { published: e.target.checked })} />
                </td>
                <td>
                  <input aria-label={`${l.code} default`} type="radio" name="default" checked={def === l.code} disabled={!(l.enabled && l.published)} onChange={() => setDef(l.code)} />
                </td>
                <td>
                  {!builtin.includes(l.code) && (
                    <button type="button" className="btn sm ghost" onClick={() => setList(list.filter((x) => x.code !== l.code))}>
                      <T s={'Remove'} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <legend className="tag">
          <T s={'Add a language'} />
        </legend>
        <label className="field">
          <T s={'Code (like it or zh-tw)'} />
          <input className="input" value={add.code} maxLength={5} onChange={(e) => setAdd({ ...add, code: e.target.value.toLowerCase() })} style={{ width: 110 }} />
        </label>
        <label className="field">
          <T s={'Name'} />
          <input className="input" value={add.name} maxLength={40} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
        </label>
        <label className="field">
          <T s={'Shown as'} />
          <input className="input" value={add.native} maxLength={40} onChange={(e) => setAdd({ ...add, native: e.target.value })} />
        </label>
        <label className="field">
          <T s={'Direction'} />
          <select className="input" value={add.dir} onChange={(e) => setAdd({ ...add, dir: e.target.value === 'rtl' ? 'rtl' : 'ltr' })}>
            <option value="ltr">
              <T s={'Left to right'} />
            </option>
            <option value="rtl">
              <T s={'Right to left'} />
            </option>
          </select>
        </label>
        <button
          type="button"
          className="btn sm ghost"
          disabled={!/^[a-z]{2}(-[a-z]{2})?$/.test(add.code) || list.some((l) => l.code === add.code) || !add.name.trim()}
          onClick={() => {
            setList([...list, { code: add.code, name: add.name.trim(), native: add.native.trim() || add.name.trim(), dir: add.dir, enabled: true, published: false, order: list.length }]);
            setAdd({ code: '', name: '', native: '', dir: 'ltr' });
          }}
        >
          <T s={'+ Add'} />
        </button>
      </fieldset>
      <div className="tag" style={{ margin: 0 }}>
        <T s={'A language reaches visitors only when it is on and published. Built-in languages can be turned off, not removed. English is always on.'} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn sm" type="submit">
          <T s={'Save'} />
        </button>
        <Msg text={msg} bad={bad} />
      </div>
    </form>
  );
}

export type Row = { key: string; english: string; value: string; source: 'published' | 'draft' | 'bundled' | 'missing' };
/* The translation editor: English beside each word; edits are saved as a draft, then published together. */
export function TranslationEditor({ lang, rows, hasDraft, multiline }: { lang: string; rows: Row[]; hasDraft: boolean; multiline?: boolean }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);
  const changed = rows.filter((r) => (vals[r.key] ?? '') !== r.value);
  const act = async (body: Record<string, unknown>, done: string) => {
    const r = await post(body);
    setBad(!r.ok);
    setMsg(r.ok ? done : r.error || tx('Could not save.'));
    if (r.ok) router.refresh();
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length === 0 && (
        <p className="muted">
          <T s={'Nothing to show with this filter.'} />
        </p>
      )}
      {rows.map((r) => (
        <div key={r.key} className="glass" style={{ padding: 12, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <code style={{ fontSize: 12 }}>{r.key}</code>
            <span className={`status ${r.source === 'missing' ? 'st-bad' : r.source === 'published' ? 'st-ok' : 'st-wait'}`}>
              {r.source === 'bundled' ? tx('machine draft') : r.source === 'missing' ? tx('missing (English shown)') : r.source}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }} lang="en">
            {r.english}
          </div>
          <textarea
            aria-label={`${r.key} in ${lang}`}
            className="input"
            lang={lang}
            dir="auto"
            rows={multiline || r.english.length > 80 || r.english.includes('\n') ? 3 : 1}
            value={vals[r.key] ?? ''}
            onChange={(e) => setVals({ ...vals, [r.key]: e.target.value })}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', position: 'sticky', bottom: 8 }}>
        <button
          type="button"
          className="btn sm"
          disabled={!changed.length}
          onClick={() =>
            act(
              { action: 'draft', lang, words: Object.fromEntries(changed.map((r) => [r.key, vals[r.key] ?? ''])) },
              tx('Saved {length} as a draft. Publish to show them.', { length: changed.length }),
            )
          }
        >
          <T s={'Save draft{v0}'} v={{ v0: changed.length ? ` (${changed.length})` : '' }} />
        </button>
        <button
          type="button"
          className="btn sm ghost"
          disabled={!hasDraft}
          onClick={() => window.confirm(tx('Publish the draft words of this language?')) && act({ action: 'publish', lang, mode: 'publish' }, 'Published.')}
        >
          <T s={'Publish draft'} />
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() =>
            window.confirm(tx('Take back every published edit of this language? The machine draft and English are shown instead.')) &&
            act({ action: 'publish', lang, mode: 'unpublish' }, 'Unpublished.')
          }
        >
          <T s={'Unpublish edits'} />
        </button>
        <Msg text={msg} bad={bad} />
      </div>
    </div>
  );
}
