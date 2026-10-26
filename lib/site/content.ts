import type { MenuEntry } from '../marketMenu';

/*
 * What an admin builds in Admin > Site builder: the top menu, the footer columns and blocks added to a page. Pure rules, safe to import in the browser.
 * Everything saved is cleaned here again on the server: lengths, how many, and every address must be a path on this site or an https address.
 * Text is never HTML (blocks use the site's own Markdown, which cannot produce HTML).
 */
export const LIMITS = { menuItems: 12, children: 12, footerColumns: 6, footerLinks: 12, blocks: 24, label: 40, text: 4000, faq: 12 };

export type Link = { label: string; href: string };
export type MenuItem = Link & { children: Link[] };
export type FooterColumn = { title: string; links: Link[] };
/* top: above everything on the page; before: before the page's own extra text and questions; bottom: after them. */
export type BlockPosition = 'top' | 'before' | 'bottom';
export type Block =
  | { id: string; type: 'heading'; position: BlockPosition; text: string; level: 2 | 3 }
  | { id: string; type: 'text'; position: BlockPosition; text: string }
  | { id: string; type: 'image'; position: BlockPosition; src: string; alt: string }
  | { id: string; type: 'button'; position: BlockPosition; label: string; href: string }
  | { id: string; type: 'listings'; position: BlockPosition; title: string; ids: string[] }
  | { id: string; type: 'faq'; position: BlockPosition; items: { q: string; a: string }[] }
  | { id: string; type: 'divider'; position: BlockPosition };
export const BLOCK_TYPES: [Block['type'], string][] = [
  ['heading', 'Heading'],
  ['text', 'Text'],
  ['image', 'Picture'],
  ['button', 'Button'],
  ['listings', 'Listings'],
  ['faq', 'Questions and answers'],
  ['divider', 'Dividing line'],
];

const str = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';
/* A path on this site ("/faq", "/templates/saas#top") or an https address. Anything else (javascript:, data:, //host) is refused. */
export const safeHref = (v: unknown): string => {
  const s = str(v, 300);
  if (/^\/(?!\/)[^\s\\]*$/.test(s)) return s;
  if (/^https:\/\/[^\s/$.?#][^\s]*$/i.test(s)) return s;
  return '';
};
/* A picture: a file on this site (our uploads) or an https address. */
const safeSrc = (v: unknown): string => safeHref(v);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const id = (v: unknown, i: number) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : `b${i}`);

function cleanLinks(v: unknown, max: number): Link[] {
  const out: Link[] = [];
  for (const r of arr(v)) {
    const o = obj(r);
    const label = str(o.label, LIMITS.label);
    const href = safeHref(o.href);
    if (label && href) out.push({ label, href });
    if (out.length >= max) break;
  }
  return out;
}

export function cleanMenu(raw: unknown): MenuItem[] {
  const out: MenuItem[] = [];
  for (const r of arr(obj(raw).items ?? raw)) {
    const o = obj(r);
    const label = str(o.label, LIMITS.label);
    const href = safeHref(o.href);
    if (!label || !href) continue;
    out.push({ label, href, children: cleanLinks(o.children, LIMITS.children) });
    if (out.length >= LIMITS.menuItems) break;
  }
  return out;
}

export function cleanFooter(raw: unknown): FooterColumn[] {
  const out: FooterColumn[] = [];
  for (const r of arr(obj(raw).columns ?? raw)) {
    const o = obj(r);
    const title = str(o.title, LIMITS.label);
    const links = cleanLinks(o.links, LIMITS.footerLinks);
    if (!title || !links.length) continue;
    out.push({ title, links });
    if (out.length >= LIMITS.footerColumns) break;
  }
  return out;
}

export function cleanBlocks(raw: unknown): Block[] {
  const out: Block[] = [];
  const seen = new Set<string>();
  arr(raw).forEach((r, i) => {
    if (out.length >= LIMITS.blocks) return;
    const o = obj(r);
    let bid = id(o.id, i);
    while (seen.has(bid)) bid += 'x';
    seen.add(bid);
    const position: BlockPosition = o.position === 'top' || o.position === 'before' ? o.position : 'bottom';
    const base = { id: bid, position };
    switch (o.type) {
      case 'heading': {
        const text = str(o.text, 120);
        if (text) out.push({ ...base, type: 'heading', text, level: o.level === 3 ? 3 : 2 });
        break;
      }
      case 'text': {
        const text = str(o.text, LIMITS.text);
        if (text) out.push({ ...base, type: 'text', text });
        break;
      }
      case 'image': {
        const src = safeSrc(o.src);
        if (src) out.push({ ...base, type: 'image', src, alt: str(o.alt, 160) });
        break;
      }
      case 'button': {
        const label = str(o.label, LIMITS.label);
        const href = safeHref(o.href);
        if (label && href) out.push({ ...base, type: 'button', label, href });
        break;
      }
      case 'listings': {
        const ids = arr(o.ids)
          .filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x))
          .slice(0, 12);
        if (ids.length) out.push({ ...base, type: 'listings', title: str(o.title, 80), ids });
        break;
      }
      case 'faq': {
        const items = arr(o.items)
          .map((x) => ({ q: str(obj(x).q, 200), a: str(obj(x).a, 1200) }))
          .filter((x) => x.q && x.a)
          .slice(0, LIMITS.faq);
        if (items.length) out.push({ ...base, type: 'faq', items });
        break;
      }
      case 'divider':
        out.push({ ...base, type: 'divider' });
        break;
    }
  });
  return out;
}

/* The built-in sections of a page that an admin can hide and reorder (the home page). The first one holds the page's heading, so it always stays. */
export const HOME_SECTIONS: [key: string, label: string][] = [
  ['hero', 'Top banner'],
  ['band', 'Shelf tiles (older site only)'],
  ['featured', 'Featured products'],
  ['categories', 'Browse by category'],
  ['why', 'Why SellOnBay'],
  ['steps', 'How a purchase goes'],
  ['sell', 'Sell on SellOnBay band'],
];
export const SECTIONS_LOCKED = ['hero'];
export type SectionsConfig = { order: string[]; hidden: string[] };
export function cleanSections(raw: unknown, known: string[]): SectionsConfig {
  const o = obj(raw);
  const list = (v: unknown) => arr(v).filter((x): x is string => typeof x === 'string' && known.includes(x));
  const uniq = (a: string[]) => a.filter((x, i) => a.indexOf(x) === i);
  return { order: uniq(list(o.order)), hidden: uniq(list(o.hidden)).filter((k) => !SECTIONS_LOCKED.includes(k)) };
}
/* The sections to draw: saved order first (sections not listed keep their built-in place after), hidden ones left out. */
export function arrangeSections(known: string[], cfg: SectionsConfig): string[] {
  const rank = (k: string) => (cfg.order.includes(k) ? cfg.order.indexOf(k) : cfg.order.length + known.indexOf(k));
  return known.filter((k) => !cfg.hidden.includes(k)).sort((a, b) => rank(a) - rank(b));
}

/* A saved menu as the top bar's own shape: an item with sub-links opens a panel, one without is a plain link. */
export const menuToEntries = (items: MenuItem[]): MenuEntry[] =>
  items.map((m, i) => ({
    key: `c${i}`,
    label: m.label,
    href: m.href,
    groups: m.children.length ? [{ title: m.label, links: m.children.map((c) => [c.label, c.href] as [string, string]) }] : [],
  }));

export const entriesToMenu = (entries: MenuEntry[]): MenuItem[] =>
  entries.map((e) => ({ label: e.label, href: e.href, children: e.groups.flatMap((g) => g.links).map(([label, href]) => ({ label, href })) }));
