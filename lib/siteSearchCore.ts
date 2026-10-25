/*
 * The pure half of the site search (lib/siteSearch.ts gathers the documents): how a query matches a document, how results are
 * ranked, and the short piece of text shown under each result. Every word typed must be found somewhere in the document (a word
 * may be part of a longer one, so "bak" finds "bakery"); words in the title count most.
 */
export type Kind = 'product' | 'page' | 'post' | 'developer' | 'category';
export type Doc = { kind: Kind; title: string; href: string; text: string; sub?: string };
export type Hit = { kind: Kind; title: string; href: string; sub?: string; snippet: string; score: number };

export const KINDS: Kind[] = ['product', 'category', 'page', 'post', 'developer'];
export const KIND_LABEL: Record<Kind, string> = { product: 'Products', category: 'Categories', page: 'Pages', post: 'Blog', developer: 'Developers' };
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/* The words of a query: folded, at most eight, and nothing shorter than one letter. */
export function words(q: string): string[] {
  return [
    ...new Set(
      fold(q.slice(0, MAX_QUERY))
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    ),
  ].slice(0, 8);
}

/* A short piece of the text around the first word found, cut at word edges. */
export function snippet(text: string, ws: string[], size = 150): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= size) return flat;
  const low = fold(flat);
  const at = ws.map((w) => low.indexOf(w)).filter((i) => i >= 0);
  const first = at.length ? Math.min(...at) : 0;
  let start = Math.max(0, first - Math.floor(size / 3));
  if (start > 0) start = flat.indexOf(' ', start) + 1 || start;
  let end = Math.min(flat.length, start + size);
  if (end < flat.length) end = flat.lastIndexOf(' ', end) > start ? flat.lastIndexOf(' ', end) : end;
  return (start > 0 ? '… ' : '') + flat.slice(start, end) + (end < flat.length ? ' …' : '');
}

/* How well one document matches, or 0 when a word is missing. */
export function scoreDoc(d: Doc, ws: string[]): number {
  if (!ws.length) return 0;
  const title = fold(d.title);
  const sub = fold(d.sub ?? '');
  const text = fold(d.text);
  let s = 0;
  for (const w of ws) {
    let ws_ = 0;
    if (title.includes(w)) ws_ += title.split(/[^\p{L}\p{N}]+/u).some((t) => t.startsWith(w)) ? 8 : 6;
    if (sub.includes(w)) ws_ += 3;
    if (text.includes(w)) ws_ += 1;
    if (!ws_) return 0;
    s += ws_;
  }
  const phrase = ws.join(' ');
  if (ws.length > 1 && (title.includes(phrase) || text.includes(phrase))) s += 4;
  return s;
}

/* Every match, best first, at most `limit` of each kind. */
export function searchDocs(docs: Doc[], q: string, limit = 50): Hit[] {
  const ws = words(q);
  if (ws.join('').length < MIN_QUERY) return [];
  const per = new Map<Kind, number>();
  return docs
    .map((d) => ({ d, score: scoreDoc(d, ws) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title))
    .filter(({ d }) => {
      const n = per.get(d.kind) ?? 0;
      per.set(d.kind, n + 1);
      return n < limit;
    })
    .map(({ d, score }) => ({ kind: d.kind, title: d.title, href: d.href, sub: d.sub, snippet: snippet(d.text, ws), score }));
}

/* Splits text into plain and found parts, so a result can mark the words without writing HTML. */
export function marks(text: string, q: string): { t: string; hit: boolean }[] {
  const ws = words(q).filter((w) => w.length >= 2);
  if (!ws.length) return [{ t: text, hit: false }];
  const low = fold(text);
  // fold() keeps the length for ordinary letters; when it does not (rare), skip marking rather than mark the wrong letters
  if (low.length !== text.length) return [{ t: text, hit: false }];
  const out: { t: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    let best = -1;
    let len = 0;
    for (const w of ws) {
      const at = low.indexOf(w, i);
      if (at >= 0 && (best < 0 || at < best || (at === best && w.length > len))) {
        best = at;
        len = w.length;
      }
    }
    if (best < 0) break;
    if (best > i) out.push({ t: text.slice(i, best), hit: false });
    out.push({ t: text.slice(best, best + len), hit: true });
    i = best + len;
  }
  if (i < text.length) out.push({ t: text.slice(i), hit: false });
  return out;
}

/* The words of a built page: the text of <main>, cut into its sections at each h2, without tags, scripts or styles. */
export function pageSections(html: string): { heading: string; text: string }[] {
  const m = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!m) return [];
  const body = m[1].replace(/<(script|style|svg|template)[\s\S]*?<\/\1>/gi, ' ');
  const parts = body.split(/(?=<h2[\s>])/i);
  const clean = (s: string) =>
    decode(s.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  return parts
    .map((p) => {
      const h = p.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i);
      return { heading: h ? clean(h[1]) : '', text: clean(h ? p.slice(h[0].length) : p) };
    })
    .filter((s) => s.text || s.heading);
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', mdash: '—', ndash: '–', middot: '·' };
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? all;
  });
}

/* A link that opens the page and, in browsers that support it, scrolls to and marks the found words (a few words of the page from the
   first match, so the browser lands on this place and not an earlier use of the same word). */
export function textFragment(href: string, text: string, ws: string[]): string {
  const low = fold(text);
  if (low.length !== text.length || href.includes('#')) return href;
  const at = ws.map((w) => low.indexOf(w)).filter((i) => i >= 0);
  if (!at.length) return href;
  const start = text.lastIndexOf(' ', Math.min(...at)) + 1;
  const phrase = text
    .slice(start)
    .split(' ')
    .slice(0, 4)
    .join(' ')
    .replace(/[^\p{L}\p{N}]+$/u, '');
  return phrase ? `${href}#:~:text=${encodeURIComponent(phrase).replace(/-/g, '%2D')}` : href;
}
