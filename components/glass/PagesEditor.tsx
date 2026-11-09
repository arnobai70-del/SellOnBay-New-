'use client';
import { useEffect, useRef, useState } from 'react';
import type { PageDef, PageDoc } from '@/lib/content/registry';
import { Button } from './Button';
import { Field } from './Field';
import { Switch } from './Switch';

/*
 * Admin › Content › Pages (owner, 2026-11-08): the words, buttons and links of one public page, which sections show and in what order, and its SEO.
 * Save a draft and the live preview beside it shows the page with that draft; publishing needs a second admin (or a Super Admin). Live data
 * (listings, prices, sellers) is not edited here.
 */
type History = { version: number; at: number; action: string }[];

export function PagesEditor({ def, initial, previewPath, hasDraft }: { def: PageDef; initial: PageDoc; previewPath: string | null; hasDraft: boolean }) {
  const [doc, setDoc] = useState<PageDoc>(initial);
  const [draft, setDraft] = useState(hasDraft);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [stamp, setStamp] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const movable = def.sections.filter((s) => !s.locked).map((s) => s.key);
  const order = [...movable].sort((a, b) => {
    const r = (k: string) => (doc.order.includes(k) ? doc.order.indexOf(k) : doc.order.length + movable.indexOf(k));
    return r(a) - r(b);
  });
  const sections = [...def.sections.filter((s) => s.locked), ...order.map((k) => def.sections.find((s) => s.key === k)!)];

  const call = async (action: 'draft' | 'publish' | 'discard' | 'restore', extra: object = {}) => {
    setMsg(null);
    const r = await fetch('/api/admin/pages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: def.key, action, ...extra }) }).catch(() => null);
    const j = ((await r?.json().catch(() => null)) ?? {}) as { error?: string };
    if (!r?.ok) return setMsg({ ok: false, text: j.error ?? 'Could not save.' });
    setMsg({ ok: true, text: { draft: 'Draft saved. The preview shows it.', publish: 'Published.', discard: 'Draft thrown away.', restore: 'That version is live again.' }[action] });
    if (action === 'draft') setDraft(true);
    if (action === 'publish' || action === 'discard') setDraft(false);
    if (action === 'restore' || action === 'discard') window.location.reload();
    setStamp(Date.now());
  };
  useEffect(() => {
    if (stamp && frame.current && previewPath) frame.current.src = `${previewPath}${previewPath.includes('?') ? '&' : '?'}draft=1&t=${stamp}`;
  }, [stamp, previewPath]);

  const setText = (id: string, v: string) => setDoc((d) => ({ ...d, text: { ...d.text, [id]: v } }));
  const move = (k: string, dir: -1 | 1) => {
    const i = order.indexOf(k),
      j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setDoc((d) => ({ ...d, order: next }));
  };
  const toggle = (k: string, on: boolean) => setDoc((d) => ({ ...d, hidden: on ? d.hidden.filter((x) => x !== k) : [...d.hidden, k] }));
  const loadHistory = async () => {
    const r = await fetch(`/api/admin/pages?key=${def.key}`).catch(() => null);
    setHistory((((await r?.json().catch(() => null)) ?? {}) as { history?: History }).history ?? []);
  };

  return (
    <div className="sob-editor">
      <div className="sob-editor-main">
        {sections.map((s) => (
          <section key={s.key} className="glass card sob-stack">
            <div className="row">
              <h2>{s.label}</h2>
              {!s.locked && (
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {def.reorder && (
                    <>
                      <button type="button" className="sob-tool" aria-label={`Move ${s.label} up`} onClick={() => move(s.key, -1)}>
                        ↑
                      </button>
                      <button type="button" className="sob-tool" aria-label={`Move ${s.label} down`} onClick={() => move(s.key, 1)}>
                        ↓
                      </button>
                    </>
                  )}
                  <Switch label={`Show ${s.label}`} checked={!doc.hidden.includes(s.key)} onChange={(on) => toggle(s.key, on)} />
                </span>
              )}
            </div>
            {s.fields.map((f) => {
              const id = `${s.key}.${f.key}`;
              const v = doc.text[id] ?? f.default;
              return f.kind === 'long' ? (
                <Field
                  key={id}
                  as="textarea"
                  label={f.label}
                  value={v}
                  onChange={(e) => setText(id, e.target.value)}
                  hint={f.default.includes('{') ? 'Keep {keep}, {fee}, {reviewHours}, {minPrice}, {payout}: they are filled from the rules.' : undefined}
                />
              ) : (
                <Field key={id} label={f.label} value={v} onChange={(e) => setText(id, e.target.value)} hint={f.kind === 'link' ? 'A path like /websites or an https address.' : undefined} />
              );
            })}
          </section>
        ))}
        {def.seo && (
          <section className="glass card sob-stack">
            <h2>Search and sharing</h2>
            <Field
              label="SEO title"
              value={doc.seo.title}
              onChange={(e) => setDoc((d) => ({ ...d, seo: { ...d.seo, title: e.target.value } }))}
              maxLength={70}
              hint="Empty: the page keeps its current title."
            />
            <Field as="textarea" label="SEO description" value={doc.seo.description} onChange={(e) => setDoc((d) => ({ ...d, seo: { ...d.seo, description: e.target.value } }))} maxLength={170} />
            <Field label="Share picture (https or an uploaded /blog/media address)" value={doc.seo.ogImage} onChange={(e) => setDoc((d) => ({ ...d, seo: { ...d.seo, ogImage: e.target.value } }))} />
          </section>
        )}
      </div>
      <aside className="sob-editor-side sob-stack">
        <div className="glass card sob-stack">
          <h2>Publish</h2>
          <p className="tag">{draft ? 'A draft is waiting.' : 'No draft.'} Another admin publishes your draft, or a Super Admin.</p>
          <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => void call('draft', { doc })}>
              Save draft
            </Button>
            <Button size="sm" onClick={() => void call('publish')} disabled={!draft}>
              Publish draft
            </Button>
            {draft && (
              <Button variant="ghost" size="sm" onClick={() => void call('discard')}>
                Throw draft away
              </Button>
            )}
          </div>
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'tag' : 'sob-err'}>
              {msg.text}
            </p>
          )}
        </div>
        {previewPath && (
          <div className="glass card sob-stack">
            <h2>Live preview</h2>
            <iframe ref={frame} title="Preview" src={`${previewPath}${previewPath.includes('?') ? '&' : '?'}draft=1`} className="sob-preview" />
            <a href={`${previewPath}${previewPath.includes('?') ? '&' : '?'}draft=1`} target="_blank" rel="noopener">
              Open the preview
            </a>
          </div>
        )}
        <div className="glass card sob-stack">
          <h2>History</h2>
          {history === null ? (
            <Button variant="ghost" size="sm" onClick={() => void loadHistory()}>
              Show published versions
            </Button>
          ) : history.length ? (
            history.map((h) => (
              <div key={h.version} className="li">
                <span style={{ flex: 1 }}>
                  Version {h.version} · {new Date(h.at).toLocaleString()}
                </span>
                <button type="button" className="sob-sx-link" onClick={() => window.confirm('Make this version live again?') && void call('restore', { version: h.version })}>
                  Restore
                </button>
              </div>
            ))
          ) : (
            <p className="tag">Nothing published yet: the page shows its built-in words.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
