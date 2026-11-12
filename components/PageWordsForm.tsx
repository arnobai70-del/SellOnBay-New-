'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PostBody } from './PostBody';
import { htmlToMarkdown, type MdNode } from '@/lib/htmlToMarkdown';
import { parseMarkdown } from '@/lib/markdown';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
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
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
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
    <form className="sob-form sob-pw-form" onSubmit={save}>
      <div className="field">
        <label htmlFor="pw-heading">
          <T s={'Page heading'} />
        </label>
        <input id="pw-heading" value={w.heading} onChange={set('heading')} maxLength={max.heading} placeholder={builtIn.heading} />
        <small>
          <T s={'The big title at the top of the page. Empty = “{heading}”. {length} / {heading2}'} v={{ heading: builtIn.heading, length: w.heading.length, heading2: max.heading }} />
        </small>
      </div>
      {hasIntro && (
        <div className="field">
          <label htmlFor="pw-intro">
            <T s={'Intro'} />
          </label>
          <textarea id="pw-intro" rows={3} value={w.intro} onChange={set('intro')} maxLength={max.intro} placeholder={builtIn.intro ?? 'The built-in intro'} />
          <small>
            <T s={'The line under the heading. Empty = the built-in intro. {length} / {intro}'} v={{ length: w.intro.length, intro: max.intro }} />
          </small>
        </div>
      )}
      {hasBody && (
        <div className="field">
          <label htmlFor="pw-body">
            <T s={'Page text'} />
          </label>
          <textarea
            id="pw-body"
            className="sob-pw-body"
            rows={22}
            value={w.body}
            onChange={set('body')}
            maxLength={max.body}
            placeholder={tx('Empty = the built-in text. Press Start from the current text to edit it.')}
          />
          <small>
            <T
              s={
                '## Heading, ### Smaller heading, - list item, 1. numbered item, **bold**, *italic*, [link](/refunds). A blank line starts a new paragraph. Numbers you type here (fees, days) do not follow later changes in the settings. {v0} / {v1}'
              }
              v={{ v0: w.body.length.toLocaleString('en-US'), v1: max.body.toLocaleString('en-US') }}
            />
          </small>
          {!w.body.trim() && (
            <button className="btn ghost sm" type="button" onClick={copyCurrent} style={{ justifySelf: 'start', marginTop: 8 }}>
              <T s={'Start from the current text'} />
            </button>
          )}
        </div>
      )}
      <div className="sob-acts">
        <button className="btn sm" type="submit" disabled={busy}>
          {busy ? 'One moment...' : 'Save'}
        </button>
        <button className="btn ghost sm" type="button" onClick={() => setW({ heading: '', intro: '', body: '' })} disabled={busy}>
          <T s={'Clear all (use the built-in words)'} />
        </button>
        <a className="btn ghost sm" href={path} target="_blank" rel="noopener">
          <T s={'Open the page'} />
        </a>
      </div>
      {msg && (
        <p className={msg.ok ? 'sob-ok' : 'sob-err'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {blocks.length > 0 && (
        <div className="sob-pw-preview">
          <b>
            <T s={'Preview of the page text'} />
          </b>
          <div className="sob-prose">
            <PostBody blocks={blocks} />
          </div>
        </div>
      )}
    </form>
  );
}
