'use client';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Youtube from '@tiptap/extension-youtube';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockMove, Callout, Cta, Figure, Gallery, WebsiteCard } from '@/lib/guides/nodes';
import { Button } from './Button';
import { Field } from './Field';
import { Switch } from './Switch';

/*
 * Admin › Content › Guides (owner, 2026-11-08). A block editor (Tiptap): headings 1 to 4, text styles, colour, alignment, lists, check lists,
 * quote, code, link, divider, table, callout, button, pictures with alt text and caption, gallery, YouTube, website cards; "/" opens the block
 * menu; Alt+Up and Alt+Down move a block. The page saves by itself every few seconds; the server cleans the HTML (lib/guides/html.ts).
 */
export type GuideFields = {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  coverUrl: string;
  coverAlt: string;
  ogImage: string;
  canonical: string;
  category: string;
  tags: string[];
  author: string;
  noindex: boolean;
  status: string;
  publishAt: string;
  bodyJson: unknown;
  bodyHtml: string;
};
type Revision = { id: number; title: string; autosave: boolean; at: number; words: number };

async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.set('file', file);
  const r = await fetch('/api/admin/posts/image', { method: 'POST', body: form });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error ?? 'Could not upload the picture.');
  return j.url;
}
const ask = (q: string, d = '') => (window.prompt(q, d) ?? '').trim();

type Block = { key: string; label: string; run: (e: Editor) => void | Promise<void> };
const BLOCKS: Block[] = [
  { key: 'h1', label: 'Heading 1', run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { key: 'h2', label: 'Heading 2', run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { key: 'h3', label: 'Heading 3', run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { key: 'h4', label: 'Heading 4', run: (e) => e.chain().focus().setHeading({ level: 4 }).run() },
  { key: 'p', label: 'Text', run: (e) => e.chain().focus().setParagraph().run() },
  { key: 'ul', label: 'Bullet list', run: (e) => e.chain().focus().toggleBulletList().run() },
  { key: 'ol', label: 'Numbered list', run: (e) => e.chain().focus().toggleOrderedList().run() },
  { key: 'todo', label: 'Check list', run: (e) => e.chain().focus().toggleTaskList().run() },
  { key: 'quote', label: 'Quote', run: (e) => e.chain().focus().toggleBlockquote().run() },
  { key: 'code', label: 'Code block', run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { key: 'hr', label: 'Divider', run: (e) => e.chain().focus().setHorizontalRule().run() },
  { key: 'table', label: 'Table', run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: 'callout', label: 'Callout box', run: (e) => e.chain().focus().setCallout('info').run() },
  {
    key: 'button',
    label: 'Button',
    run: (e) => {
      const href = ask('Where does the button go? (/websites or https://...)', '/websites');
      const label = ask('Button text', 'Browse websites');
      if (href && label) e.chain().focus().insertCta(href, label).run();
    },
  },
  {
    key: 'website',
    label: 'Website card',
    run: (e) => {
      const v = ask('The website address name (the end of /websites/...)');
      const slug = v.replace(/^.*\/websites\//, '').replace(/[^a-z0-9-]/gi, '');
      if (slug) e.chain().focus().insertWebsite(slug).run();
    },
  },
  {
    key: 'youtube',
    label: 'YouTube video',
    run: (e) => {
      const src = ask('YouTube address');
      if (src) e.chain().focus().setYoutubeVideo({ src }).run();
    },
  },
];

export function GuideEditor({ initial, categories }: { initial: GuideFields; categories: string[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [slash, setSlash] = useState<{ q: string; i: number } | null>(null);
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const runRef = useRef<(b: Block) => void>(() => {});

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: { openOnClick: false, autolink: true, protocols: ['https', 'http', 'mailto'] } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Figure,
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Write, or type / for a block' }),
      Callout,
      Cta,
      Gallery,
      WebsiteCard,
      BlockMove,
    ],
    content: (initial.bodyJson as object | null) ?? initial.bodyHtml ?? '',
    editorProps: {
      attributes: { class: 'g-prose g-editor-area', 'aria-label': 'Guide text', role: 'textbox', 'aria-multiline': 'true' },
      handleKeyDown: (_view, event) => {
        const s = slashRef.current;
        if (!s) return false;
        const list = BLOCKS.filter((b) => b.label.toLowerCase().includes(s.q.toLowerCase()));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          setSlash({ ...s, i: (s.i + (event.key === 'ArrowDown' ? 1 : list.length - 1)) % Math.max(1, list.length) });
          return true;
        }
        if (event.key === 'Enter' && list[s.i]) {
          runRef.current(list[s.i]);
          return true;
        }
        if (event.key === 'Escape') {
          setSlash(null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      setDirty(true);
      const { $from, empty } = e.state.selection;
      const text = $from.parent.textContent;
      setSlash(empty && /^\/[a-z0-9 ]*$/i.test(text) && $from.parentOffset === text.length ? { q: text.slice(1), i: 0 } : null);
    },
  });
  const counts = useEditorState({
    editor,
    selector: (c) => ({ words: c.editor?.storage.characterCount.words() ?? 0, bold: c.editor?.isActive('bold') ?? false, italic: c.editor?.isActive('italic') ?? false }),
  });

  runRef.current = (b: Block) => {
    if (!editor) return;
    const { $from } = editor.state.selection;
    editor.chain().focus().deleteRange({ from: $from.start(), to: $from.pos }).run();
    setSlash(null);
    void b.run(editor);
  };

  const set = <K extends keyof GuideFields>(k: K, v: GuideFields[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  const save = useCallback(
    async (action: 'draft' | 'publish' | 'schedule' | 'unpublish', autosave = false) => {
      if (!editor) return;
      if (!f.title.trim()) {
        if (!autosave) setMsg({ ok: false, text: 'Give the guide a title first.' });
        return;
      }
      const res = await fetch('/api/admin/guides', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...f,
          action,
          autosave,
          publishAt: f.publishAt ? new Date(f.publishAt + (f.publishAt.length === 16 ? ':00Z' : '')).toISOString() : null,
          bodyHtml: editor.getHTML(),
          bodyJson: editor.getJSON(),
        }),
      }).catch(() => null);
      const j = ((await res?.json().catch(() => null)) ?? {}) as { id?: string; slug?: string; status?: string; error?: string; issues?: { message?: string }[] };
      if (!res?.ok) {
        if (!autosave) setMsg({ ok: false, text: j.issues?.[0]?.message ?? j.error ?? 'Could not save.' });
        return;
      }
      setDirty(false);
      setSavedAt(Date.now());
      setF((x) => ({ ...x, id: j.id ?? x.id, slug: j.slug ?? x.slug, status: j.status ?? x.status }));
      if (!autosave) setMsg({ ok: true, text: { draft: 'Draft saved.', publish: 'Published.', schedule: 'Scheduled.', unpublish: 'Unpublished.' }[action] });
      if (!f.id && j.id) router.replace(`/admin/content/guides/edit?id=${j.id}`, { scroll: false });
    },
    [editor, f, router],
  );

  // Autosave: 15 seconds after the last change, as a draft copy; what is on the site does not change.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => void save('draft', true), 15_000);
    return () => clearTimeout(t);
  }, [dirty, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const addImage = async (file: File | undefined) => {
    if (!file || !editor) return;
    try {
      const src = await upload(file);
      const alt = ask('Describe the picture (alt text, needed)');
      if (!alt) return setMsg({ ok: false, text: 'A picture needs alt text. It was not added.' });
      const caption = ask('Caption (optional)');
      editor
        .chain()
        .focus()
        .setImage({ src, alt, title: caption || undefined })
        .run();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const addGallery = async (files: FileList | null) => {
    if (!files?.length || !editor) return;
    try {
      const images: { src: string; alt: string }[] = [];
      for (const file of [...files].slice(0, 12)) {
        const src = await upload(file);
        const alt = ask(`Alt text for ${file.name} (needed)`);
        if (alt) images.push({ src, alt });
      }
      if (images.length) editor.chain().focus().insertGallery(images).run();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const loadRevisions = async () => {
    if (!f.id) return;
    const r = await fetch(`/api/admin/guides/${f.id}/revisions`).catch(() => null);
    setRevs((((await r?.json().catch(() => null)) ?? {}) as { revisions?: Revision[] }).revisions ?? []);
  };
  const restore = async (id: number) => {
    if (!f.id || !window.confirm('Put this version back? The current words are kept as a version too.')) return;
    const r = await fetch(`/api/admin/guides/${f.id}/revisions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revisionId: id }) });
    if (r.ok) window.location.reload();
  };

  const tool = (label: string, run: () => void, active = false, text = label) => (
    <button type="button" className={`g-tool${active ? ' on' : ''}`} aria-label={label} aria-pressed={active} title={label} onMouseDown={(e) => e.preventDefault()} onClick={run}>
      {text}
    </button>
  );
  const slashList = slash ? BLOCKS.filter((b) => b.label.toLowerCase().includes(slash.q.toLowerCase())) : [];
  const words = counts?.words ?? 0;

  return (
    <div className="g-editor">
      <div className="g-editor-main">
        <Field label="Title" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
        {editor && (
          <div className="g-toolbar" role="toolbar" aria-label="Formatting">
            {tool('Undo', () => editor.chain().focus().undo().run(), false, '↶')}
            {tool('Redo', () => editor.chain().focus().redo().run(), false, '↷')}
            {[1, 2, 3, 4].map((l) =>
              tool(
                `Heading ${l}`,
                () =>
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: l as 1 | 2 | 3 | 4 })
                    .run(),
                editor.isActive('heading', { level: l }),
                `H${l}`,
              ),
            )}
            {tool('Bold', () => editor.chain().focus().toggleBold().run(), counts?.bold, 'B')}
            {tool('Italic', () => editor.chain().focus().toggleItalic().run(), counts?.italic, 'I')}
            {tool('Underline', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'U')}
            {tool('Strike', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), 'S')}
            {tool('Highlight', () => editor.chain().focus().toggleHighlight({ color: '#fbefd9' }).run(), editor.isActive('highlight'), 'Mark')}
            <label className="g-tool" title="Text colour">
              <span className="g-sr">Text colour</span>A
              <input type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} style={{ width: 18, height: 18, border: 0, padding: 0, marginLeft: 4 }} />
            </label>
            {(['left', 'center', 'right'] as const).map((a) => tool(`Align ${a}`, () => editor.chain().focus().setTextAlign(a).run(), editor.isActive({ textAlign: a }), a[0].toUpperCase()))}
            {tool('Inline code', () => editor.chain().focus().toggleCode().run(), editor.isActive('code'), '</>')}
            {tool(
              'Link',
              () => {
                const href = ask('Link address (https://... or /websites)', editor.getAttributes('link').href ?? '');
                if (!href) editor.chain().focus().unsetLink().run();
                else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
              },
              editor.isActive('link'),
              'Link',
            )}
            {tool('Picture', () => fileRef.current?.click(), false, 'Picture')}
            {tool('Gallery', () => galleryRef.current?.click(), false, 'Gallery')}
            {tool('Move block up (Alt+Up)', () => editor.chain().focus().moveBlock(-1).run(), false, '↑')}
            {tool('Move block down (Alt+Down)', () => editor.chain().focus().moveBlock(1).run(), false, '↓')}
            {editor.isActive('table') && (
              <>
                {tool('Add row', () => editor.chain().focus().addRowAfter().run(), false, '+Row')}
                {tool('Add column', () => editor.chain().focus().addColumnAfter().run(), false, '+Col')}
                {tool('Delete table', () => editor.chain().focus().deleteTable().run(), false, '−Table')}
              </>
            )}
            {editor.isActive('image') &&
              (['100', '50', '25'] as const).map((w) =>
                tool(`Picture width ${w}%`, () => editor.chain().focus().updateAttributes('image', { width: w }).run(), editor.getAttributes('image').width === w, `${w}%`),
              )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void addImage(e.target.files?.[0])} />
            <input ref={galleryRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => void addGallery(e.target.files)} />
          </div>
        )}
        <div className="g-editor-wrap">
          <EditorContent editor={editor} />
          {slash && slashList.length > 0 && (
            <ul className="g-sx-pop g-glass g-slash" role="listbox" aria-label="Blocks">
              {slashList.map((b, i) => (
                <li key={b.key} role="option" aria-selected={i === slash.i} className={i === slash.i ? 'on' : undefined}>
                  <a
                    href="#"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      runRef.current(b);
                    }}
                  >
                    <span className="g-sx-t">{b.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="g-tag">
          {words} words · {Math.max(1, Math.round(words / 220))} min read · {dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Saved'}
        </p>
      </div>

      <aside className="g-editor-side g-stack">
        <div className="g-glass g-card g-stack">
          <h2>Publish</h2>
          <p className="g-tag">State: {f.status}</p>
          <div className="g-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => void save('draft')}>
              Save draft
            </Button>
            <Button size="sm" onClick={() => void save('publish')}>
              Publish
            </Button>
            {(f.status === 'published' || f.status === 'scheduled') && (
              <Button variant="ghost" size="sm" onClick={() => void save('unpublish')}>
                Unpublish
              </Button>
            )}
          </div>
          <Field label="Publish later (UTC, YYYY-MM-DDTHH:MM)" type="datetime-local" value={f.publishAt} onChange={(e) => set('publishAt', e.target.value)} />
          <Button variant="ghost" size="sm" onClick={() => void save('schedule')} disabled={!f.publishAt}>
            Schedule
          </Button>
          {f.id && f.slug && (
            <a href={`/guides/${f.slug}?preview=1`} target="_blank" rel="noopener">
              Preview
            </a>
          )}
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'g-tag' : 'g-field-e'}>
              {msg.text}
            </p>
          )}
        </div>
        <div className="g-glass g-card g-stack">
          <h2>Details</h2>
          <Field label="Address (slug)" value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} hint="Small letters, numbers and dashes. Empty: made from the title." />
          <Field as="select" label="Category" value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Field>
          <Field
            label="Tags (comma separated)"
            value={f.tags.join(', ')}
            onChange={(e) =>
              set(
                'tags',
                e.target.value
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 12),
              )
            }
          />
          <Field label="Author" value={f.author} onChange={(e) => set('author', e.target.value)} maxLength={80} />
          <Field as="textarea" label="Summary" value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} maxLength={300} />
          <div>
            <Field label="Cover picture" value={f.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} hint="Upload, or paste an https address." />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Upload a cover picture"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) set('coverUrl', await upload(file).catch(() => f.coverUrl));
              }}
            />
          </div>
          <Field label="Cover alt text" value={f.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} maxLength={150} />
        </div>
        <div className="g-glass g-card g-stack">
          <h2>Search and sharing</h2>
          <Field label="SEO title" value={f.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} maxLength={70} hint={`${f.metaTitle.length} of about 60 shown`} />
          <Field
            as="textarea"
            label="SEO description"
            value={f.metaDescription}
            onChange={(e) => set('metaDescription', e.target.value)}
            maxLength={170}
            hint={`${f.metaDescription.length} of about 160 shown`}
          />
          <Field label="Share picture (OG image)" value={f.ogImage} onChange={(e) => set('ogImage', e.target.value)} hint="Empty: the cover is used." />
          <Field label="Canonical address" value={f.canonical} onChange={(e) => set('canonical', e.target.value)} hint="Only when the guide first appeared elsewhere." />
          <div className="g-li">
            <span style={{ flex: 1 }}>Hide from search engines (noindex)</span>
            <Switch label="Hide from search engines" checked={f.noindex} onChange={(on) => set('noindex', on)} />
          </div>
        </div>
        {f.id && (
          <div className="g-glass g-card g-stack">
            <h2>History</h2>
            {revs === null ? (
              <Button variant="ghost" size="sm" onClick={() => void loadRevisions()}>
                Show versions
              </Button>
            ) : revs.length ? (
              revs.map((r) => (
                <div key={r.id} className="g-li">
                  <span style={{ flex: 1 }}>
                    {new Date(r.at).toLocaleString()} · {r.words} words{r.autosave ? ' · autosave' : ''}
                  </span>
                  <button type="button" className="g-sx-link" onClick={() => void restore(r.id)}>
                    Restore
                  </button>
                </div>
              ))
            ) : (
              <p className="g-tag">No versions yet.</p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
