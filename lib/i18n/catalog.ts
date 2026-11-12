import { PAGES } from '../content/registry';
import { EN_UI } from './messages/en';

/*
 * The catalogue of words (owner, 2026-11-12), pure and tested. The English source is the interface words (messages/en.ts) plus every page word
 * an admin can edit (lib/content/registry.ts, as "page.<page>.<section>.<field>"). Each other language has a bundled machine draft
 * (messages/<code>.ts, loaded only when that language is asked for) and the admin's published edits on top. A missing word falls back to
 * English, never to a key or an empty space.
 */
export type Catalog = Record<string, string>;

let english: Catalog | null = null;
export function englishCatalog(): Catalog {
  if (english) return english;
  const out: Catalog = { ...EN_UI };
  for (const p of PAGES) for (const s of p.sections) for (const f of s.fields) if (f.kind !== 'link' && f.kind !== 'image' && f.default) out[`page.${p.key}.${s.key}.${f.key}`] = f.default;
  english = out;
  return out;
}

const LOADERS: Record<string, () => Promise<{ default: Catalog }>> = {
  bn: () => import('./messages/bn'),
  ar: () => import('./messages/ar'),
  hi: () => import('./messages/hi'),
  es: () => import('./messages/es'),
  fr: () => import('./messages/fr'),
  de: () => import('./messages/de'),
  pt: () => import('./messages/pt'),
};
export const hasBundle = (lang: string) => lang in LOADERS;
/* The bundled draft of one language (only that one is loaded). A language an admin added has none: its words come from the admin. */
export async function bundled(lang: string): Promise<Catalog> {
  const load = LOADERS[lang];
  return load ? (await load()).default : {};
}

/* {n} -> 3. Unknown placeholders stay as they are (the page fills {keep}, {minPrice}... itself). */
export const format = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/* One word in a language: the admin's published edit, then the bundled draft, then English, then the key itself (a code mistake, never empty). */
export function lookup(key: string, published: Catalog, bundle: Catalog, en: Catalog = englishCatalog()): string {
  const pick = (v: string | undefined) => (typeof v === 'string' && v.trim() ? v : undefined);
  return pick(published[key]) ?? pick(bundle[key]) ?? en[key] ?? key;
}

/* The placeholders in a text, so a translation that drops or invents one can be refused. */
export const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
export function placeholderProblem(english: string, translated: string): string | null {
  const a = placeholders(english).join(',');
  const b = placeholders(translated).join(',');
  return a === b ? null : `The translation must keep the same {placeholders} as the English text (${a || 'none'}).`;
}

/* What a language still lacks: keys with no admin edit and no bundled draft (shown in English to visitors). */
export function missingKeys(published: Catalog, bundle: Catalog, en: Catalog = englishCatalog()): string[] {
  return Object.keys(en).filter((k) => !(published[k]?.trim() || bundle[k]?.trim()));
}
