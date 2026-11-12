/*
 * Interface words by their English text (owner, 2026-11-12, i18n phase 2). In the code a word is written in English inside tx('…'); the
 * English text is its key, so a missing translation shows the English text and never a key. scripts/i18n-extract.mjs lists every tx('…') of the
 * code in lib/i18n/strings/catalog.json (with whether a client component uses it), and a test checks that every bundled language has every
 * string with the same {placeholders}. Pure: used by server pages (lib/i18n/server.ts) and by client components (components/i18n/TxProvider).
 */
export type Dict = Record<string, string>;
export const TX_PREFIX = 'tx:'; // the admin's edits of these words are stored as "tx:<English>" next to the other keys

export function txLookup(dict: Dict | null | undefined, english: string, vars?: Record<string, string | number>): string {
  const v = dict?.[english];
  const s = typeof v === 'string' && v.trim() ? v : english;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/* A plain tx for code that runs before any language is known (English): it only fills placeholders, so the extractor still sees the text. */
export const tx = (english: string, vars?: Record<string, string | number>) => txLookup(null, english, vars);
