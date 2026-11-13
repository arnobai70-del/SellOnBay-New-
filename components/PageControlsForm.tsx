'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CONTROL_MAX, type Faq, type PageControls } from '@/lib/seo/controls';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/*
 * Publishing, search, picture, text, related listings and questions for one page. The server decides everything (lib/seo/controlStore.ts);
 * this only collects the words. Saving a page as draft or archived makes it a real 404 for visitors; the page and its text are kept and can be
 * published again here. A signed-in admin can still open it to check it (it says noindex).
 */
export function PageControlsForm({
  path,
  saved,
  locked,
  listings,
  ideas,
  shown,
  suggested,
}: {
  path: string;
  saved: PageControls;
  locked: boolean;
  listings: { id: string; name: string }[];
  ideas: string[];
  shown: { title: string; description: string; host: string };
  /* The questions the page shows by itself (a listing's); the editor can start from them. */
  suggested?: { q: string; a: string }[];
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [c, setC] = useState<PageControls>(saved);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof PageControls>(k: K, v: PageControls[K]) => setC((p) => ({ ...p, [k]: v }));
  const text = (k: 'canonical' | 'ogTitle' | 'ogDescription' | 'ogImage' | 'ogImageAlt' | 'focusKeyword' | 'keywords') => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value);
  const setFaq = (i: number, f: Partial<Faq>) =>
    set(
      'faqs',
      c.faqs.map((x, j) => (j === i ? { ...x, ...f } : x)),
    );
  const move = (i: number, d: number) => {
    const to = i + d;
    if (to < 0 || to >= c.faqs.length) return;
    const next = [...c.faqs];
    [next[i], next[to]] = [next[to], next[i]];
    set('faqs', next);
  };
  const missing = c.faqs.some((f) => !f.q.trim() || !f.a.trim());

  async function upload(file: File | undefined) {
    if (!file) return;
    setUp(true);
    setMsg(null);
    const body = new FormData();
    body.append('file', file);
    const r = await fetch('/api/admin/posts/image', { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    setUp(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? tx('Could not upload the picture.') });
    set('ogImage', j.url);
    setMsg({ ok: true, text: tx('Picture uploaded. Save to use it.') });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/seo/controls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, ...c }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? tx('Something went wrong.') });
    setMsg({ ok: true, text: tx('Saved. The page and the sitemap follow within a minute.') });
    router.refresh();
  }

  const cardTitle = c.ogTitle || shown.title;
  const cardDesc = c.ogDescription || shown.description;

  return (
    <form className="sob-form" onSubmit={save}>
      <div className="field">
        <label htmlFor="pc-status">
          <T s={'Publication'} />
        </label>
        <select id="pc-status" value={locked ? 'published' : c.status} disabled={locked} onChange={(e) => set('status', e.target.value as PageControls['status'])}>
          <option value="published">
            <T s={'Published: visitors can open it'} />
          </option>
          <option value="draft">
            <T s={'Draft: a 404 for visitors, kept here'} />
          </option>
          <option value="archived">
            <T s={'Archived: a 404 for visitors, kept here'} />
          </option>
        </select>
        <small>{locked ? tx('The home page, legal and support pages always stay public.') : tx('Publishing and search are separate: a published page can still be kept out of search below.')}</small>
      </div>
      <label className="chk">
        <input type="checkbox" checked={c.index} onChange={(e) => set('index', e.target.checked)} />
        <span>
          <T s={'Let search engines list this page (off = noindex)'} />
        </span>
      </label>
      <label className="chk">
        <input type="checkbox" checked={c.follow} onChange={(e) => set('follow', e.target.checked)} />
        <span>
          <T s={'Let search engines follow its links (off = nofollow)'} />
        </span>
      </label>
      <label className="chk">
        <input type="checkbox" checked={c.sitemap} onChange={(e) => set('sitemap', e.target.checked)} />
        <span>
          <T s={'Put it in sitemap.xml (only when it is also published and listed)'} />
        </span>
      </label>
      <div className="field">
        <label htmlFor="pc-canon">
          <T s={'Canonical address'} />
        </label>
        <input id="pc-canon" value={c.canonical} onChange={text('canonical')} maxLength={CONTROL_MAX.canonical} />
        <small>
          <T s={'Empty = the page’s own address (best). Use an https address or a path starting with /.'} />
        </small>
      </div>

      <h4>
        <T s={'Featured picture and share card'} />
      </h4>
      <div className="field">
        <label htmlFor="pc-file">
          <T s={'Upload a picture'} />
        </label>
        <input id="pc-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={up} onChange={(e) => upload(e.target.files?.[0])} />
        <small>
          <T s={'PNG, JPEG, WebP or GIF up to 5 MB, about 1200 by 630. {v0}'} v={{ v0: up ? 'Uploading...' : '' }} />
        </small>
      </div>
      <div className="field">
        <label htmlFor="pc-ogi">
          <T s={'Or a picture address'} />
        </label>
        <input id="pc-ogi" value={c.ogImage} onChange={text('ogImage')} maxLength={CONTROL_MAX.ogImage} />
        <small>
          <T s={'An https address or a path on this site. Empty = the site-wide card.'} />
        </small>
      </div>
      <div className="field">
        <label htmlFor="pc-alt">
          <T s={'Picture description (alt text)'} />
        </label>
        <input id="pc-alt" value={c.ogImageAlt} onChange={text('ogImageAlt')} maxLength={CONTROL_MAX.imageAlt} />
        <small>
          <T s={'Say what the picture shows, in plain words. {length} / {imageAlt}'} v={{ length: c.ogImageAlt.length, imageAlt: CONTROL_MAX.imageAlt }} />
        </small>
      </div>
      <div className="field">
        <label htmlFor="pc-ogt">
          <T s={'Share title (Facebook, LinkedIn, X)'} />
        </label>
        <input id="pc-ogt" value={c.ogTitle} onChange={text('ogTitle')} maxLength={CONTROL_MAX.ogTitle} />
        <small>
          <T s={'Empty = the meta title. {length} / {ogTitle}'} v={{ length: c.ogTitle.length, ogTitle: CONTROL_MAX.ogTitle }} />
        </small>
      </div>
      <div className="field">
        <label htmlFor="pc-ogd">
          <T s={'Share description'} />
        </label>
        <input id="pc-ogd" value={c.ogDescription} onChange={text('ogDescription')} maxLength={CONTROL_MAX.ogDescription} />
        <small>
          <T s={'Empty = the meta description. {length} / {ogDescription}'} v={{ length: c.ogDescription.length, ogDescription: CONTROL_MAX.ogDescription }} />
        </small>
      </div>
      <div className="sob-pe-serp" aria-label={tx('Share card preview')}>
        {c.ogImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.ogImage} alt={c.ogImageAlt} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8 }} />
        )}
        <span className="sob-pe-sd">{shown.host}</span>
        <span className="sob-pe-st">{cardTitle}</span>
        <span className="sob-pe-sd">{cardDesc}</span>
      </div>

      <h4>
        <T s={'Keywords'} />
      </h4>
      <div className="field">
        <label htmlFor="pc-kw">
          <T s={'Focus keyword (your note)'} />
        </label>
        <input id="pc-kw" value={c.focusKeyword} onChange={text('focusKeyword')} maxLength={CONTROL_MAX.focusKeyword} />
        <small>
          <T s={'For planning only. It is never written into the page as a meta keywords tag.'} />
        </small>
      </div>
      <div className="field">
        <label htmlFor="pc-kws">
          <T s={'Secondary keywords (your notes)'} />
        </label>
        <input id="pc-kws" value={c.keywords} onChange={text('keywords')} maxLength={CONTROL_MAX.keywords} />
        {ideas.length > 0 && (
          <small>
            <T s={'Ideas from this page’s own words (click to add):'} />{' '}
            {ideas.map((k) => (
              <button key={k} type="button" className="btn ghost sm" style={{ margin: '2px 4px 2px 0' }} onClick={() => set('keywords', c.keywords ? `${c.keywords}, ${k}` : k)}>
                {k}
              </button>
            ))}
          </small>
        )}
      </div>

      <h4>
        <T s={'Extra text on the page'} />
      </h4>
      <div className="field">
        <label htmlFor="pc-content">
          <T s={'Text (Markdown)'} />
        </label>
        <textarea id="pc-content" rows={8} value={c.content} onChange={(e) => set('content', e.target.value)} maxLength={CONTROL_MAX.content} />
        <small>
          <T
            s={'Shown under the page’s own content in the site’s usual text style. ## makes a heading. No HTML is allowed. {length} / {content}'}
            v={{ length: c.content.length, content: CONTROL_MAX.content }}
          />
        </small>
      </div>

      <h4>
        <T s={'Related listings'} />
      </h4>
      {listings.length === 0 ? (
        <small>
          <T s={'No live seller listing yet.'} />
        </small>
      ) : (
        <div className="field">
          {listings.map((l) => (
            <label className="chk" key={l.id}>
              <input
                type="checkbox"
                checked={c.related.includes(l.id)}
                disabled={!c.related.includes(l.id) && c.related.length >= CONTROL_MAX.related}
                onChange={(e) => set('related', e.target.checked ? [...c.related, l.id] : c.related.filter((x) => x !== l.id))}
              />
              <span>{l.name}</span>
            </label>
          ))}
          <small>
            <T s={'Up to {related}.'} v={{ related: CONTROL_MAX.related }} />
          </small>
        </div>
      )}

      <h4>
        <T s={'Structured data'} />
      </h4>
      <label className="chk">
        <input type="checkbox" checked={c.schema} onChange={(e) => set('schema', e.target.checked)} />
        <span>
          <T s={'Write WebPage data (name, address, description and picture) when this page has text, questions, related listings or a picture saved'} />
        </span>
      </label>
      <label className="chk">
        <input type="checkbox" checked={c.faqSchema} onChange={(e) => set('faqSchema', e.target.checked)} />
        <span>
          <T s={'Write FAQ data from the published questions below'} />
        </span>
      </label>

      <h4>
        <T s={'Questions and answers'} />
      </h4>
      <small>
        <T s={'Published questions show on the page and go into its FAQ data from this same list. Drafts show nowhere. Google may or may not show them as rich results.'} />
      </small>
      {c.faqs.map((f, i) => (
        <div className="sob-item" key={i}>
          <div className="field">
            <label htmlFor={`pc-q${i}`}>
              <T s={'Question {v0}'} v={{ v0: i + 1 }} />
            </label>
            <input id={`pc-q${i}`} value={f.q} onChange={(e) => setFaq(i, { q: e.target.value })} maxLength={CONTROL_MAX.question} />
          </div>
          <div className="field">
            <label htmlFor={`pc-a${i}`}>
              <T s={'Answer'} />
            </label>
            <textarea id={`pc-a${i}`} rows={3} value={f.a} onChange={(e) => setFaq(i, { a: e.target.value })} maxLength={CONTROL_MAX.answer} />
          </div>
          <label className="chk">
            <input type="checkbox" checked={!!f.draft} onChange={(e) => setFaq(i, { draft: e.target.checked })} />
            <span>
              <T s={'Draft (hidden)'} />
            </span>
          </label>
          <div className="sob-acts">
            <button className="btn ghost sm" type="button" onClick={() => move(i, -1)} disabled={i === 0}>
              <T s={'Move up'} />
            </button>
            <button className="btn ghost sm" type="button" onClick={() => move(i, 1)} disabled={i === c.faqs.length - 1}>
              <T s={'Move down'} />
            </button>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() =>
                set(
                  'faqs',
                  c.faqs.filter((_, j) => j !== i),
                )
              }
            >
              <T s={'Delete'} />
            </button>
          </div>
        </div>
      ))}
      {suggested && suggested.length > 0 && c.faqs.length === 0 && (
        <div className="sob-acts">
          <small>
            <T s={'This page shows {length} questions by itself, made from its own details. Start from them to change or remove any.'} v={{ length: suggested.length }} />
          </small>
          <button
            className="btn ghost sm"
            type="button"
            onClick={() =>
              set(
                'faqs',
                suggested.slice(0, CONTROL_MAX.faqs).map((f) => ({ q: f.q.slice(0, CONTROL_MAX.question), a: f.a.slice(0, CONTROL_MAX.answer) })),
              )
            }
          >
            <T s={'Start from the automatic questions'} />
          </button>
        </div>
      )}
      {missing && (
        <small>
          <T s={'Every question needs an answer before you save. Delete an empty one.'} />
        </small>
      )}
      <div className="sob-acts">
        <button className="btn ghost sm" type="button" disabled={c.faqs.length >= CONTROL_MAX.faqs} onClick={() => set('faqs', [...c.faqs, { q: '', a: '', draft: true }])}>
          <T s={'Add a question'} />
        </button>
        <button className="btn sm" type="submit" disabled={busy || missing}>
          {busy ? tx('One moment...') : tx('Save publishing, search, text and questions')}
        </button>
      </div>
      {msg && (
        <p className={msg.ok ? 'ok' : 'sob-err'} role="status">
          {msg.text}
        </p>
      )}
    </form>
  );
}
