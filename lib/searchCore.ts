/*
 * Smart search (owner, 2026-11-08): the scoring used for guides and help articles, and for websites and sellers when there is no database.
 * With a database, websites and sellers are ranked by Postgres (full-text plus pg_trgm, migration 0081) with the same weights. Pure and tested.
 *
 * A field matches when it contains the query (any part of a word, any letter sequence), when it starts with it, or when its letter trigrams
 * are close enough (typos). Weights: title 1, category and stack 0.6, seller 0.4, description 0.25, tags 0.1.
 */
export const MIN_QUERY = 2;
export const MAX_QUERY = 80;
export const WEIGHTS = { title: 1, category: 0.6, seller: 0.4, description: 0.25, tags: 0.1 } as const;
export type Field = keyof typeof WEIGHTS;

export const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/* Letter trigrams of each word, padded like pg_trgm ("  w", " wo", "wor", "ord", "rd "). */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(s).split(' ').filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/* pg_trgm's similarity(): shared trigrams over all trigrams of both. */
export function similarity(a: string, b: string): number {
  const x = trigrams(a),
    y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / (x.size + y.size - both);
}

/* pg_trgm's word_similarity(q, text): how well the query matches the best part of the text (here: its best word or pair of words). */
export function wordSimilarity(q: string, text: string): number {
  const words = norm(text).split(' ').filter(Boolean);
  let best = 0;
  for (let i = 0; i < words.length; i++) {
    best = Math.max(best, similarity(q, words[i]));
    if (i + 1 < words.length) best = Math.max(best, similarity(q, `${words[i]} ${words[i + 1]}`));
  }
  return best;
}

/* How well one field matches: contains (start of the field or of a word counts more), else close by trigrams, else 0. */
export function fieldMatch(q: string, text: string): number {
  const nq = norm(q),
    nt = norm(text);
  if (!nq || !nt) return 0;
  if (nt.startsWith(nq)) return 1;
  if (` ${nt}`.includes(` ${nq}`)) return 0.9;
  if (nt.includes(nq)) return 0.75; // any letter sequence inside a word
  const words = nq.split(' ');
  if (words.length > 1 && words.every((w) => nt.includes(w))) return 0.7;
  const ws = wordSimilarity(nq, nt);
  return ws >= 0.35 ? ws * 0.7 : 0; // typo-tolerant
}

export type Doc = Partial<Record<Field, string>>;
export function scoreDoc(q: string, d: Doc): number {
  let s = 0;
  for (const f of Object.keys(WEIGHTS) as Field[]) if (d[f]) s += WEIGHTS[f] * fieldMatch(q, d[f]!);
  return Math.round(s * 1000) / 1000;
}

export function rank<T>(q: string, list: readonly T[], doc: (x: T) => Doc, limit = 50): { item: T; score: number }[] {
  if (norm(q).length < MIN_QUERY) return [];
  return list
    .map((item) => ({ item, score: scoreDoc(q, doc(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* "Did you mean": the closest titles when nothing matched. */
export function suggestions(q: string, titles: readonly string[], n = 3): string[] {
  return titles
    .map((t) => ({ t, s: Math.max(similarity(q, t), wordSimilarity(q, t)) }))
    .filter((x) => x.s >= 0.2)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.t)
    .filter((t, i, a) => a.indexOf(t) === i);
}

/* Where the query's words appear in a text, for highlighting: [start, end) pairs, merged, case-insensitive. Typo matches are not highlighted. */
export function highlight(text: string, q: string): [number, number][] {
  const lower = text.toLowerCase();
  const out: [number, number][] = [];
  for (const w of q
    .toLowerCase()
    .split(/\s+/)
    .filter((x) => x.length >= 1)) {
    let i = lower.indexOf(w);
    while (i !== -1 && out.length < 20) {
      out.push([i, i + w.length]);
      i = lower.indexOf(w, i + w.length);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/* The anchor of a help answer, so a search result opens at it (app/(glass)/help). */
export const helpAnchor = (q: string) => 'q-' + norm(q).replace(/ /g, '-').slice(0, 60);

/* A query that can be a domain name: "bakery" or "bakery.com". */
export function domainGuess(q: string): string | null {
  const s = q
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
  if (!/^[a-z0-9][a-z0-9-]{1,62}(\.[a-z]{2,12})?$/.test(s)) return null;
  return s.includes('.') ? s : `${s}.com`;
}
