'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PostBody } from './PostBody';
import { htmlToMarkdown, type MdNode } from '@/lib/htmlToMarkdown';
import { parseMarkdown } from '@/lib/markdown';

type Words = { heading: string; intro: string; body: string };

/*
 * Rewrites one page's heading, intro and (policy pages) whole text. Empty boxes mean "use the built-in words".
 * "Start from the current text" copies the page's words as they show now, so a rewrite never starts from a blank box.
 */
export function PageWordsForm({
  path,
  saved,
  builtIn,
  hasIntro,
  hasBody,
  max,
}: {
  path: string;
  saved: Words;
  builtIn: { heading: string; intro?: string };
  hasIntro: boolean;
  hasBody: boolean;
  max: { heading: number; intro: number; body: number };
}) {
  const router = useRouter();
  const [w, setW] = useState<Words>(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof Words) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setW((p) => ({ ...p, [k]: e.target.value }));

  async function copyCurrent() {
    setMsg(null);
    try {
      const r = await fetch(path, { headers: { accept: 'text/html' }, cache: 'no-store' });
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      const el = doc.querySelector('[data-page-text]');
      if (!r.ok || !el) throw new Error();
      setW((p) => ({ ...p, body: htmlToMarkdown(el as unknown as MdNode) }));
    } catch {
      setMsg({ ok: false, text: 'Could not read the page. Try again, or write the text yourself.' });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/seo/words', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, ...w }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setMsg({ ok: true, text: 'Saved. The page shows the new words within a minute.' });
    router.refresh();
  }

  const blocks = hasBody && w.body.trim() ? parseMarkdown(w.body) : [];
  return (
    <form className="adm-form pw-form" onSubmit={save}>
      <div className="field">
        <label htmlFor="pw-heading">Page heading</label>
        <input id="pw-heading" value={w.heading} onChange={set('heading')} maxLength={max.heading} placeholder={builtIn.heading} />
        <small>
          The big title at the top of the page. Empty = &ldquo;{builtIn.heading}&rdquo;. {w.heading.length} / {max.heading}
        </small>
      </div>
      {hasIntro && (
        <div className="field">
          <label htmlFor="pw-intro">Intro</label>
          <textarea id="pw-intro" rows={3} value={w.intro} onChange={set('intro')} maxLength={max.intro} placeholder={builtIn.intro ?? 'The built-in intro'} />
          <small>
            The line under the heading. Empty = the built-in intro. {w.intro.length} / {max.intro}
          </small>
        </div>
      )}
      {hasBody && (
        <div className="field">
          <label htmlFor="pw-body">Page text</label>
          <textarea
            id="pw-body"
            className="pw-body"
            rows={22}
            value={w.body}
            onChange={set('body')}
            maxLength={max.body}
            placeholder="Empty = the built-in text. Press Start from the current text to edit it."
          />
          <small>
            ## Heading, ### Smaller heading, - list item, 1. numbered item, **bold**, *italic*, [link](/refunds). A blank line starts a new paragraph. Numbers you type here (fees, days) do not follow
            later changes in the settings. {w.body.length.toLocaleString('en-US')} / {max.body.toLocaleString('en-US')}
          </small>
          {!w.body.trim() && (
            <button className="btn btn-line btn-sm" type="button" onClick={copyCurrent} style={{ justifySelf: 'start', marginTop: 8 }}>
              Start from the current text
            </button>
          )}
        </div>
      )}
      <div className="adm-btns">
        <button className="btn btn-blue btn-sm" type="submit" disabled={busy}>
          {busy ? 'One moment...' : 'Save'}
        </button>
        <button className="btn btn-line btn-sm" type="button" onClick={() => setW({ heading: '', intro: '', body: '' })} disabled={busy}>
          Clear all (use the built-in words)
        </button>
        <a className="btn btn-line btn-sm" href={path} target="_blank" rel="noopener">
          Open the page
        </a>
      </div>
      {msg && (
        <p className={msg.ok ? 'adm-ok' : 'form-err'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {blocks.length > 0 && (
        <div className="pw-preview">
          <b>Preview of the page text</b>
          <div className="prose">
            <PostBody blocks={blocks} />
          </div>
        </div>
      )}
    </form>
  );
}
