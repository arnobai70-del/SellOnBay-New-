'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PostBody } from '@/components/PostBody';
import { parseMarkdown, safeHref, videoOf } from '@/lib/markdown';
import { GOOD, LIMITS, descriptionOf, postProblem, seoHints, slugify, type Post } from '@/lib/postRules';

/*
 * The post editor in the admin panel: title, address, meta title and meta description with live character counts, a preview of how the post
 * looks in Google, SEO hints, and the text in simple Markdown with a toolbar (headings, bold, italic, links, lists, quote, picture
 * upload or link, video, dividing line) and a preview. The title is the page's only h1, so the toolbar starts at H2. The server checks
 * everything again (lib/posts.ts).
 */
type Draft = Pick<Post, 'title' | 'slug' | 'metaTitle' | 'metaDescription' | 'excerpt' | 'body' | 'coverUrl' | 'coverAlt' | 'status' | 'noindex'>;
const EMPTY: Draft = { title: '', slug: '', metaTitle: '', metaDescription: '', excerpt: '', body: '', coverUrl: '', coverAlt: '', status: 'draft', noindex: false };

function Count({ n, good, max }: { n: number; good: number; max: number }) {
  return <small className={n > good ? 'pe-over' : 'muted'}>{`${n} / ${good} shown in Google (max ${max})`}</small>;
}

/* Line marks the toolbar can set or clear at the start of each chosen line. */
const LINE_MARK = /^(#{1,4}\s+|[-*]\s+|\d+[.)]\s+|>\s?)/;

export function PostEditor({ post, siteUrl, siteName }: { post: (Draft & { id: string }) | null; siteUrl: string; siteName: string }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(post ?? EMPTY);
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v, ...(k === 'title' && !slugTouched ? { slug: slugify(String(v)) } : {}) }));

  const shownTitle = (d.metaTitle || d.title || 'Post title') + ` · ${siteName}`;
  const shownDesc = descriptionOf(d) || 'The meta description you write appears here.';
  const hints = seoHints(d);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);

  /* Replaces the chosen text (or inserts at the cursor) and puts the selection back where the writer expects it. */
  function edit(fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) {
    const el = area.current;
    if (!el) return;
    const r = fn(d.body, el.selectionStart, el.selectionEnd);
    if (r.text.length > LIMITS.body) return setMsg({ ok: false, text: 'The post is too long.' });
    set('body', r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  }
  const wrap = (before: string, after: string, sample: string) =>
    edit((t, a, b) => {
      const inner = t.slice(a, b) || sample;
      return { text: t.slice(0, a) + before + inner + after + t.slice(b), start: a + before.length, end: a + before.length + inner.length };
    });
  const lines = (mark: string, numbered = false) =>
    edit((t, a, b) => {
      const from = t.lastIndexOf('\n', a - 1) + 1;
      const to = t.indexOf('\n', b) === -1 ? t.length : t.indexOf('\n', b);
      const out = t
        .slice(from, to)
        .split('\n')
        .map((l, i) => (l.trim() ? (numbered ? `${i + 1}. ` : mark) + l.replace(LINE_MARK, '') : l))
        .join('\n');
      return { text: t.slice(0, from) + out + t.slice(to), start: from, end: from + out.length };
    });
  const block = (md: string) =>
    edit((t, a) => {
      const before = t.slice(0, a).replace(/\s*$/, '');
      const after = t.slice(a).replace(/^\s*/, '');
      const head = before ? before + '\n\n' : '';
      return { text: head + md + (after ? '\n\n' + after : '\n'), start: head.length + md.length, end: head.length + md.length };
    });

  function addLink() {
    const href = window.prompt('Link address (https://... or a page here, like /browse)');
    if (!href) return;
    if (!safeHref(href)) return setMsg({ ok: false, text: 'That link address is not allowed. Use https://... or a path like /browse.' });
    wrap('[', `](${href.trim()})`, 'link text');
  }
  function addImageLink() {
    const src = window.prompt('Picture address (https://...)');
    if (!src) return;
    const h = safeHref(src);
    if (!h || (h.external && !h.href.startsWith('https:'))) return setMsg({ ok: false, text: 'Use a picture address that starts with https://' });
    const alt = window.prompt('What the picture shows (for people who cannot see it)') ?? '';
    block(`![${alt.replace(/[[\]]/g, '')}](${h.href})`);
  }
  async function upload(f: File) {
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append('file', f);
    const r = await fetch('/api/admin/posts/image', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    setUploading(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Could not upload the picture.' });
    const alt = window.prompt('What the picture shows (for people who cannot see it)') ?? '';
    block(`![${alt.replace(/[[\]]/g, '')}](${j.url})`);
  }
  function addVideo() {
    const src = window.prompt('Video address: YouTube, Vimeo, or an https .mp4 / .webm file');
    if (!src) return;
    if (!videoOf(src)) return setMsg({ ok: false, text: 'Use a YouTube or Vimeo address, or an https link to an .mp4 or .webm file.' });
    const title = window.prompt('A short title for the video (optional)') ?? '';
    block(`@[${title.replace(/[[\]]/g, '') || 'video'}](${src.trim()})`);
  }
  const TOOLS: [string, string, () => void][] = [
    ['H2', 'Heading', () => lines('## ')],
    ['H3', 'Smaller heading', () => lines('### ')],
    ['P', 'Normal paragraph', () => lines('')],
    ['B', 'Bold', () => wrap('**', '**', 'bold text')],
    ['I', 'Italic', () => wrap('*', '*', 'italic text')],
    ['Link', 'Add a link', addLink],
    ['• List', 'Bullet list', () => lines('- ')],
    ['1. List', 'Numbered list', () => lines('', true)],
    ['Quote', 'Quote', () => lines('> ')],
    ['Line', 'Dividing line', () => block('---')],
  ];

  async function save(status: Draft['status']) {
    const next = { ...d, status };
    const bad = postProblem(next);
    if (bad) return setMsg({ ok: false, text: bad });
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', id: post?.id ?? null, ...next }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setD(next);
    setMsg({ ok: true, text: status === 'published' ? 'Saved and published.' : 'Saved as a draft.' });
    if (!post) router.replace(`/dashboard/admin/seo/post?id=${j.id}`);
    else router.refresh();
  }

  async function remove() {
    if (!post || !window.confirm('Delete this post for good?')) return;
    setBusy(true);
    const r = await fetch('/api/admin/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: post.id }) });
    setBusy(false);
    if (r.ok) router.replace('/dashboard/admin/seo');
    else setMsg({ ok: false, text: 'Could not delete the post.' });
  }

  return (
    <div className="pe">
      <div className="pe-main">
        <div className="field">
          <label htmlFor="pe-title">Title (the heading on the page)</label>
          <input id="pe-title" value={d.title} maxLength={LIMITS.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pe-slug">Address</label>
          <input
            id="pe-slug"
            value={d.slug}
            maxLength={LIMITS.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', slugify(e.target.value));
            }}
          />
          <small className="muted">{`${siteUrl}/blog/${d.slug || '...'}`} Changing it after publishing breaks old links.</small>
        </div>
        <div className="field">
          <label htmlFor="pe-mt">Meta title</label>
          <input id="pe-mt" value={d.metaTitle} maxLength={LIMITS.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} placeholder="Empty = the title" />
          <Count n={(d.metaTitle || d.title).length} good={GOOD.metaTitle} max={LIMITS.metaTitle} />
        </div>
        <div className="field">
          <label htmlFor="pe-md">Meta description</label>
          <textarea id="pe-md" rows={3} value={d.metaDescription} maxLength={LIMITS.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} />
          <Count n={d.metaDescription.length} good={GOOD.metaDescription} max={LIMITS.metaDescription} />
        </div>
        <div className="field">
          <label htmlFor="pe-ex">Short summary (shown on the blog page)</label>
          <textarea id="pe-ex" rows={2} value={d.excerpt} maxLength={LIMITS.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pe-cover">Cover picture address (https://, optional)</label>
          <input id="pe-cover" value={d.coverUrl} maxLength={500} onChange={(e) => set('coverUrl', e.target.value)} />
        </div>
        {d.coverUrl && (
          <div className="field">
            <label htmlFor="pe-alt">What the picture shows (alt text)</label>
            <input id="pe-alt" value={d.coverAlt} maxLength={LIMITS.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} />
          </div>
        )}
        <div className="field">
          <div className="pe-bodyhead">
            <label htmlFor="pe-body">Post</label>
            <div className="pe-tabs" role="group" aria-label="Write or preview">
              <button type="button" aria-pressed={view === 'write'} onClick={() => setView('write')}>
                Write
              </button>
              <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>
                Preview
              </button>
            </div>
          </div>
          {view === 'write' ? (
            <>
              <div className="pe-tools" role="toolbar" aria-label="Formatting">
                {TOOLS.map(([label, title, run]) => (
                  <button key={label} type="button" title={title} aria-label={title} onClick={run}>
                    {label}
                  </button>
                ))}
                <button type="button" title="Upload a picture" aria-label="Upload a picture" disabled={uploading} onClick={() => file.current?.click()}>
                  {uploading ? 'Uploading…' : 'Upload picture'}
                </button>
                <button type="button" title="Picture from a link" aria-label="Picture from a link" onClick={addImageLink}>
                  Picture link
                </button>
                <button type="button" title="Add a video" aria-label="Add a video" onClick={addVideo}>
                  Video
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label="Upload a picture"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) upload(f);
                  }}
                />
              </div>
              <textarea ref={area} id="pe-body" className="pe-body" rows={22} value={d.body} maxLength={LIMITS.body} onChange={(e) => set('body', e.target.value)} />
              <small className="muted">
                The title above is the page&apos;s H1, so headings in the post start at H2. Pictures: PNG, JPEG, WebP or GIF up to 5 MB. Videos: YouTube, Vimeo or an .mp4 / .webm link.
              </small>
            </>
          ) : (
            <div className="pe-preview post">
              <div className="prose">{d.body.trim() ? <PostBody blocks={parseMarkdown(d.body)} /> : <p className="muted">Nothing written yet.</p>}</div>
            </div>
          )}
        </div>
        <label className="adm-check">
          <input type="checkbox" checked={d.noindex} onChange={(e) => set('noindex', e.target.checked)} />
          <span>Keep this post out of Google (noindex)</span>
        </label>
        <div className="adm-btns">
          <button className="btn btn-dark btn-sm" type="button" disabled={busy} onClick={() => save('published')}>
            {d.status === 'published' ? 'Save changes' : 'Publish'}
          </button>
          <button className="btn btn-line btn-sm" type="button" disabled={busy} onClick={() => save('draft')}>
            {d.status === 'published' ? 'Unpublish (back to draft)' : 'Save draft'}
          </button>
          {post && d.status === 'published' && (
            <a className="btn btn-line btn-sm" href={`/blog/${d.slug}`} target="_blank" rel="noopener">
              View post
            </a>
          )}
          {post && (
            <button className="btn btn-line btn-sm" type="button" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
        </div>
        {msg && (
          <p className={msg.ok ? 'adm-ok' : 'form-err'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </div>
      <aside className="pe-side">
        <b>How it looks in Google</b>
        <div className="pe-serp">
          <span className="pe-url">{`${siteUrl.replace(/^https?:\/\//, '')} › blog › ${d.slug || '...'}`}</span>
          <span className="pe-st">{shownTitle}</span>
          <span className="pe-sd">{shownDesc}</span>
        </div>
        <b>SEO check</b>
        {hints.length ? (
          <ul className="pe-hints">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        ) : (
          <p className="adm-ok">Looks good.</p>
        )}
      </aside>
    </div>
  );
}
