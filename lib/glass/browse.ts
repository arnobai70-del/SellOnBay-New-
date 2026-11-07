/*
 * The rules of the /websites list: reading the address, filtering, sorting and paging. Pure and tested. Every filter lives in the address, so the page is
 * server-rendered, works without JavaScript, and junk values are simply ignored.
 */
export type BrowseItem = {
  id: string;
  name: string;
  desc: string;
  cat: string;
  seller: string;
  stack?: string;
  price: number;
  rating: number;
  reviews: number;
  sold: number;
  added: string;
  featured?: boolean;
};
export const SORTS = ['featured', 'top', 'best', 'new', 'price-asc', 'price-desc'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = { featured: 'Featured', top: 'Top rated', best: 'Best selling', new: 'Newest', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low' };
export const PER_PAGE = 12;

export type BrowseQuery = { q: string; category: string; min: number | null; max: number | null; rated: boolean; sort: Sort; page: number };
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const dollars = (v: string) => {
  const n = Number(v.replace(/^\$/, ''));
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : null;
};

export function readQuery(raw: Raw, categories: readonly string[]): BrowseQuery {
  const sort = one(raw.sort) as Sort;
  const category = one(raw.category);
  const page = Number(one(raw.page));
  return {
    q: one(raw.q).trim().slice(0, 100),
    category: categories.includes(category) ? category : '',
    min: dollars(one(raw.min)),
    max: dollars(one(raw.max)),
    rated: one(raw.rated) === '1',
    sort: SORTS.includes(sort) ? sort : 'featured',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/* Every word must appear somewhere; a word in the name counts more. */
function score(p: BrowseItem, words: string[]) {
  const name = p.name.toLowerCase();
  const all = `${name} ${p.desc} ${p.cat} ${p.seller} ${p.stack ?? ''}`.toLowerCase();
  if (!words.every((w) => all.includes(w))) return null;
  return words.filter((w) => name.includes(w)).length;
}
const addedAt = (p: BrowseItem) => Date.parse(p.added) || 0;
const COMPARE: Record<Sort, (a: BrowseItem, b: BrowseItem) => number> = {
  featured: (a, b) => Number(!!b.featured) - Number(!!a.featured) || b.rating - a.rating || addedAt(b) - addedAt(a),
  top: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  best: (a, b) => b.sold - a.sold,
  new: (a, b) => addedAt(b) - addedAt(a),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
};

/* `inCategory` says which category a listing is in, so the caller's mapping stays the only one. */
export function browse<T extends BrowseItem>(list: readonly T[], q: BrowseQuery, inCategory: (p: T) => string | null): { items: T[]; total: number; pages: number; page: number } {
  const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = list
    .map((p) => ({ p, s: words.length ? score(p, words) : 0 }))
    .filter((x): x is { p: T; s: number } => x.s !== null)
    .filter(({ p }) => (!q.category || inCategory(p) === q.category) && (q.min === null || p.price >= q.min) && (q.max === null || p.price <= q.max) && (!q.rated || (p.reviews > 0 && p.rating >= 4)));
  scored.sort((a, b) => b.s - a.s || COMPARE[q.sort](a.p, b.p) || a.p.id.localeCompare(b.p.id));
  const pages = Math.max(1, Math.ceil(scored.length / PER_PAGE));
  const page = Math.min(q.page, pages);
  return { items: scored.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((x) => x.p), total: scored.length, pages, page };
}

/* An address that keeps the current filters and changes the ones given. */
export function browseHref(q: BrowseQuery, change: Partial<BrowseQuery> = {}): string {
  const n = { ...q, page: 1, ...change };
  const s = new URLSearchParams();
  if (n.q) s.set('q', n.q);
  if (n.category) s.set('category', n.category);
  if (n.min !== null) s.set('min', String(n.min));
  if (n.max !== null) s.set('max', String(n.max));
  if (n.rated) s.set('rated', '1');
  if (n.sort !== 'featured') s.set('sort', n.sort);
  if (n.page > 1) s.set('page', String(n.page));
  const text = s.toString();
  return '/websites' + (text ? '?' + text : '');
}
