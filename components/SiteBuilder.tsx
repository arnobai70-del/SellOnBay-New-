'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BLOCK_TYPES, LIMITS, SECTIONS_LOCKED, type Block, type FooterColumn, type Link, type MenuItem, type SectionsConfig } from '@/lib/site/content';

/*
 * Admin > Site builder: the top menu, the footer and the blocks of a page, edited in place. Every list can be added to, removed from and moved up or down.
 * The server checks everything again (lib/site/content.ts). "Show the built-in one again" takes the saved version away.
 */
type Msg = { ok: boolean; text: string } | null;
const move = <T,>(list: T[], i: number, d: -1 | 1): T[] => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};
const without = <T,>(list: T[], i: number) => list.filter((_, k) => k !== i);
const change = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, k) => (k === i ? { ...x, ...patch } : x));

function Row({ onUp, onDown, onDelete, children }: { onUp: () => void; onDown: () => void; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className="adm-card" style={{ display: 'grid', gap: 8 }}>
      {children}
      <div className="adm-btns">
        <button className="btn btn-line btn-sm" type="button" onClick={onUp} aria-label="Move up">
          Up
        </button>
        <button className="btn btn-line btn-sm" type="button" onClick={onDown} aria-label="Move down">
          Down
        </button>
        <button className="btn btn-line btn-sm" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/site', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (r?.ok) {
      setMsg({ ok: true, text: done });
      router.refresh();
    } else setMsg({ ok: false, text: j?.error ?? 'Could not save. Try again.' });
  };
  return { busy, msg, run };
}

const Status = ({ msg }: { msg: Msg }) =>
  msg ? (
    <p className={msg.ok ? 'ok' : 'err'} role="status">
      {msg.text}
    </p>
  ) : null;

/* ---------- the top menu ---------- */
export function MenuBuilder({ initial, custom }: { initial: MenuItem[]; custom: boolean }) {
  const [items, setItems] = useState<MenuItem[]>(initial);
  const { busy, msg, run } = useSave();
  const setChild = (i: number, children: Link[]) => setItems(change(items, i, { children }));
  return (
    <div className="adm-form">
      <p className="muted">
        {custom ? 'This menu is saved by you and replaces the built-in one.' : 'This is the built-in menu. Change it and save to use your own.'} Up to {LIMITS.menuItems} items; an item with sub-links
        opens a panel.
      </p>
      {items.map((m, i) => (
        <Row key={i} onUp={() => setItems(move(items, i, -1))} onDown={() => setItems(move(items, i, 1))} onDelete={() => setItems(without(items, i))}>
          <div className="field">
            <label>Name</label>
            <input value={m.label} maxLength={LIMITS.label} onChange={(e) => setItems(change(items, i, { label: e.target.value }))} />
          </div>
          <div className="field">
            <label>Address (a path like /faq, or https://…)</label>
            <input value={m.href} onChange={(e) => setItems(change(items, i, { href: e.target.value }))} />
          </div>
          <details>
            <summary>Sub-links ({m.children.length})</summary>
            {m.children.map((c, k) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 6, marginTop: 6 }}>
                <input aria-label="Sub-link name" value={c.label} maxLength={LIMITS.label} onChange={(e) => setChild(i, change(m.children, k, { label: e.target.value }))} />
                <input aria-label="Sub-link address" value={c.href} onChange={(e) => setChild(i, change(m.children, k, { href: e.target.value }))} />
                <button className="btn btn-line btn-sm" type="button" onClick={() => setChild(i, move(m.children, k, -1))} aria-label="Move sub-link up">
                  Up
                </button>
                <button className="btn btn-line btn-sm" type="button" onClick={() => setChild(i, move(m.children, k, 1))} aria-label="Move sub-link down">
                  Down
                </button>
                <button className="btn btn-line btn-sm" type="button" onClick={() => setChild(i, without(m.children, k))}>
                  Delete
                </button>
              </div>
            ))}
            {m.children.length < LIMITS.children && (
              <button className="btn btn-line btn-sm" type="button" style={{ marginTop: 8 }} onClick={() => setChild(i, [...m.children, { label: '', href: '/' }])}>
                Add a sub-link
              </button>
            )}
          </details>
        </Row>
      ))}
      <div className="adm-btns">
        {items.length < LIMITS.menuItems && (
          <button className="btn btn-line" type="button" onClick={() => setItems([...items, { label: '', href: '/', children: [] }])}>
            Add a menu item
          </button>
        )}
        <button className="btn btn-dark" type="button" disabled={busy} onClick={() => run({ kind: 'menu', value: items }, 'Menu saved. It shows on every page.')}>
          Save menu
        </button>
        {custom && (
          <button className="btn btn-line" type="button" disabled={busy} onClick={() => run({ kind: 'menu', reset: true }, 'The built-in menu is back.')}>
            Show the built-in menu again
          </button>
        )}
      </div>
      <Status msg={msg} />
    </div>
  );
}

/* ---------- the footer ---------- */
export function FooterBuilder({ initial, custom }: { initial: FooterColumn[]; custom: boolean }) {
  const [cols, setCols] = useState<FooterColumn[]>(initial);
  const { busy, msg, run } = useSave();
  const setLinks = (i: number, links: Link[]) => setCols(change(cols, i, { links }));
  return (
    <div className="adm-form">
      <p className="muted">
        {custom ? 'These columns are saved by you and replace the built-in ones.' : 'These are the built-in columns. Change them and save to use your own.'} Up to {LIMITS.footerColumns} columns of{' '}
        {LIMITS.footerLinks} links. The legal line at the bottom always stays.
      </p>
      {cols.map((c, i) => (
        <Row key={i} onUp={() => setCols(move(cols, i, -1))} onDown={() => setCols(move(cols, i, 1))} onDelete={() => setCols(without(cols, i))}>
          <div className="field">
            <label>Column title</label>
            <input value={c.title} maxLength={LIMITS.label} onChange={(e) => setCols(change(cols, i, { title: e.target.value }))} />
          </div>
          {c.links.map((l, k) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: 6 }}>
              <input aria-label="Link name" value={l.label} maxLength={LIMITS.label} onChange={(e) => setLinks(i, change(c.links, k, { label: e.target.value }))} />
              <input aria-label="Link address" value={l.href} onChange={(e) => setLinks(i, change(c.links, k, { href: e.target.value }))} />
              <button className="btn btn-line btn-sm" type="button" onClick={() => setLinks(i, move(c.links, k, -1))} aria-label="Move link up">
                Up
              </button>
              <button className="btn btn-line btn-sm" type="button" onClick={() => setLinks(i, move(c.links, k, 1))} aria-label="Move link down">
                Down
              </button>
              <button className="btn btn-line btn-sm" type="button" onClick={() => setLinks(i, without(c.links, k))}>
                Delete
              </button>
            </div>
          ))}
          {c.links.length < LIMITS.footerLinks && (
            <button className="btn btn-line btn-sm" type="button" style={{ justifySelf: 'start' }} onClick={() => setLinks(i, [...c.links, { label: '', href: '/' }])}>
              Add a link
            </button>
          )}
        </Row>
      ))}
      <div className="adm-btns">
        {cols.length < LIMITS.footerColumns && (
          <button className="btn btn-line" type="button" onClick={() => setCols([...cols, { title: '', links: [{ label: '', href: '/' }] }])}>
            Add a column
          </button>
        )}
        <button className="btn btn-dark" type="button" disabled={busy} onClick={() => run({ kind: 'footer', value: cols }, 'Footer saved. It shows on every page.')}>
          Save footer
        </button>
        {custom && (
          <button className="btn btn-line" type="button" disabled={busy} onClick={() => run({ kind: 'footer', reset: true }, 'The built-in footer is back.')}>
            Show the built-in footer again
          </button>
        )}
      </div>
      <Status msg={msg} />
    </div>
  );
}

/* ---------- the blocks of a page ---------- */
const blank = (type: Block['type']): Block => {
  const id = 'b' + Math.random().toString(36).slice(2, 8);
  const base = { id, position: 'bottom' as const };
  switch (type) {
    case 'heading':
      return { ...base, type, text: '', level: 2 };
    case 'text':
      return { ...base, type, text: '' };
    case 'image':
      return { ...base, type, src: '', alt: '' };
    case 'button':
      return { ...base, type, label: '', href: '/' };
    case 'listings':
      return { ...base, type, title: '', ids: [] };
    case 'faq':
      return { ...base, type, items: [{ q: '', a: '' }] };
    default:
      return { ...base, type: 'divider' };
  }
};

export function BlocksBuilder({ path, initial, listings }: { path: string; initial: Block[]; listings: [id: string, name: string][] }) {
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [add, setAdd] = useState<Block['type']>('text');
  const [up, setUp] = useState(false);
  const { busy, msg, run } = useSave();
  const set = (i: number, patch: Record<string, unknown>) => setBlocks(blocks.map((b, k) => (k === i ? ({ ...b, ...patch } as Block) : b)));
  async function upload(i: number, file?: File | null) {
    if (!file) return;
    setUp(true);
    const fd = new FormData();
    fd.set('file', file);
    const r = await fetch('/api/admin/posts/image', { method: 'POST', body: fd }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
    setUp(false);
    if (j?.url) set(i, { src: j.url });
    else alert(j?.error ?? 'The picture could not be uploaded.');
  }
  return (
    <div className="adm-form">
      <p className="muted">
        Blocks set to &ldquo;Top of the page&rdquo; show above everything. The others show in the area under the page, in this order: &ldquo;before&rdquo; ones first, then the page&rsquo;s own extra
        text and questions, then the &ldquo;after&rdquo; ones. Up to {LIMITS.blocks} blocks.
      </p>
      {blocks.map((b, i) => (
        <Row key={b.id} onUp={() => setBlocks(move(blocks, i, -1))} onDown={() => setBlocks(move(blocks, i, 1))} onDelete={() => setBlocks(without(blocks, i))}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{BLOCK_TYPES.find(([t]) => t === b.type)?.[1]}</b>
            <select aria-label="Position" value={b.position} onChange={(e) => set(i, { position: e.target.value })}>
              <option value="top">Top of the page</option>
              <option value="before">Before the page&rsquo;s extra text</option>
              <option value="bottom">After the page&rsquo;s extra text</option>
            </select>
          </div>
          {b.type === 'heading' && (
            <>
              <input aria-label="Heading" value={b.text} maxLength={120} placeholder="Heading" onChange={(e) => set(i, { text: e.target.value })} />
              <select aria-label="Size" value={b.level} onChange={(e) => set(i, { level: Number(e.target.value) })}>
                <option value={2}>Big heading</option>
                <option value={3}>Smaller heading</option>
              </select>
            </>
          )}
          {b.type === 'text' && (
            <textarea
              aria-label="Text"
              rows={5}
              value={b.text}
              maxLength={LIMITS.text}
              placeholder="Text. You can use **bold**, [links](/faq), lists and ## headings."
              onChange={(e) => set(i, { text: e.target.value })}
            />
          )}
          {b.type === 'image' && (
            <>
              <input aria-label="Picture address" value={b.src} placeholder="/blog/media/… or https://…" onChange={(e) => set(i, { src: e.target.value })} />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={up} onChange={(e) => upload(i, e.target.files?.[0])} />
              <input aria-label="Describe the picture" value={b.alt} maxLength={160} placeholder="Describe the picture" onChange={(e) => set(i, { alt: e.target.value })} />
            </>
          )}
          {b.type === 'button' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <input aria-label="Button text" value={b.label} maxLength={LIMITS.label} placeholder="Button text" onChange={(e) => set(i, { label: e.target.value })} />
              <input aria-label="Button address" value={b.href} placeholder="/sell or https://…" onChange={(e) => set(i, { href: e.target.value })} />
            </div>
          )}
          {b.type === 'listings' && (
            <>
              <input aria-label="Title" value={b.title} maxLength={80} placeholder="Title (optional)" onChange={(e) => set(i, { title: e.target.value })} />
              <small>Pick up to 12 live listings:</small>
              <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflow: 'auto' }}>
                {listings.length === 0 && <small className="muted">No live listings yet.</small>}
                {listings.map(([id, name]) => (
                  <label key={id} style={{ display: 'flex', gap: 8 }}>
                    <input type="checkbox" checked={b.ids.includes(id)} onChange={(e) => set(i, { ids: e.target.checked ? [...b.ids, id].slice(0, 12) : b.ids.filter((x) => x !== id) })} />
                    {name}
                  </label>
                ))}
              </div>
            </>
          )}
          {b.type === 'faq' && (
            <>
              {b.items.map((it, k) => (
                <div key={k} style={{ display: 'grid', gap: 4 }}>
                  <input aria-label="Question" value={it.q} maxLength={200} placeholder="Question" onChange={(e) => set(i, { items: change(b.items, k, { q: e.target.value }) })} />
                  <textarea aria-label="Answer" rows={2} value={it.a} maxLength={1200} placeholder="Answer" onChange={(e) => set(i, { items: change(b.items, k, { a: e.target.value }) })} />
                  <button className="btn btn-line btn-sm" type="button" style={{ justifySelf: 'start' }} onClick={() => set(i, { items: without(b.items, k) })}>
                    Delete this question
                  </button>
                </div>
              ))}
              {b.items.length < LIMITS.faq && (
                <button className="btn btn-line btn-sm" type="button" style={{ justifySelf: 'start' }} onClick={() => set(i, { items: [...b.items, { q: '', a: '' }] })}>
                  Add a question
                </button>
              )}
            </>
          )}
        </Row>
      ))}
      <div className="adm-btns">
        {blocks.length < LIMITS.blocks && (
          <>
            <select aria-label="Kind of block" value={add} onChange={(e) => setAdd(e.target.value as Block['type'])}>
              {BLOCK_TYPES.map(([t, label]) => (
                <option key={t} value={t}>
                  {label}
                </option>
              ))}
            </select>
            <button className="btn btn-line" type="button" onClick={() => setBlocks([...blocks, blank(add)])}>
              Add a block
            </button>
          </>
        )}
        <button className="btn btn-dark" type="button" disabled={busy} onClick={() => run({ kind: 'blocks', path, value: blocks }, 'Saved. The page shows these blocks now.')}>
          Save blocks
        </button>
        {initial.length > 0 && (
          <button className="btn btn-line" type="button" disabled={busy} onClick={() => run({ kind: 'blocks', path, reset: true }, 'All blocks of this page were removed.')}>
            Remove all blocks
          </button>
        )}
      </div>
      <Status msg={msg} />
    </div>
  );
}

/* ---------- the built-in sections of the home page ---------- */
export function SectionsBuilder({ keys, initial }: { keys: [string, string][]; initial: SectionsConfig }) {
  const start = [...keys.map(([k]) => k)].sort((a, b) => {
    const r = (k: string) => (initial.order.includes(k) ? initial.order.indexOf(k) : initial.order.length + keys.findIndex(([x]) => x === k));
    return r(a) - r(b);
  });
  const [order, setOrder] = useState<string[]>(start);
  const [hidden, setHidden] = useState<string[]>(initial.hidden);
  const { busy, msg, run } = useSave();
  const label = (k: string) => keys.find(([x]) => x === k)?.[1] ?? k;
  return (
    <div className="adm-form">
      <p className="muted">
        The sections of the home page, in the order they show. Hide one to take it off the page, move it to change the order. The top banner holds the page&rsquo;s heading, so it always stays.
      </p>
      {order.map((k, i) => (
        <Row
          key={k}
          onUp={() => setOrder(move(order, i, -1))}
          onDown={() => setOrder(move(order, i, 1))}
          onDelete={() => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k])}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <b>{label(k)}</b>
            {hidden.includes(k) && <span className="chip rose">Hidden</span>}
            {SECTIONS_LOCKED.includes(k) && <span className="chip">Always shown</span>}
          </div>
          <small>{SECTIONS_LOCKED.includes(k) ? 'The Delete button is not used for this section.' : 'The Delete button here hides the section, or shows it again.'}</small>
        </Row>
      ))}
      <div className="adm-btns">
        <button
          className="btn btn-dark"
          type="button"
          disabled={busy}
          onClick={() => run({ kind: 'sections', value: { order, hidden: hidden.filter((k) => !SECTIONS_LOCKED.includes(k)) } }, 'Saved. The home page uses this order now.')}
        >
          Save sections
        </button>
        <button className="btn btn-line" type="button" disabled={busy} onClick={() => run({ kind: 'sections', reset: true }, 'The built-in order is back.')}>
          Back to the built-in order
        </button>
      </div>
      <Status msg={msg} />
    </div>
  );
}
