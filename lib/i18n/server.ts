import 'server-only';
import { headers } from 'next/headers';
import { bundled, clientStrings, format, lookup } from './catalog';
import { TX_PREFIX, txLookup, type Dict } from './tx';
import { dirOf, HEADER, liveLanguages, SOURCE, type Dir, type Language } from './config';
import { languageSettings } from './settingsRead';
import { publishedWords } from './store';

/*
 * The language of this request (owner, 2026-11-12). proxy.ts sets the header on every request (it overwrites anything a visitor sends): the
 * /<code>/ prefix on public pages, the saved choice elsewhere. Only an enabled and published language is used; anything else is English.
 */
export async function requestLang(): Promise<string> {
  let asked = SOURCE;
  try {
    asked = (await headers()).get(HEADER) ?? SOURCE;
  } catch {
    return SOURCE; // outside a request (build, tests)
  }
  if (asked === SOURCE) return SOURCE;
  const s = await languageSettings();
  return liveLanguages(s).some((l) => l.code === asked) ? asked : SOURCE;
}

export type I18n = {
  lang: string;
  dir: Dir;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /* A word that may not exist in the catalogue (product words): its translation, else the given English. */
  pick: (key: string, english: string) => string;
  /* An interface word by its English text (lib/i18n/tx.ts). */
  tx: (english: string, vars?: Record<string, string | number>) => string;
  /* A message known only at run time (an API error passed along from lib/): its translation when the catalogue has it, else as it is. */
  translate: (english: string) => string;
  /* The words client components need, for this language only (empty for English: nothing is sent). */
  clientDict: Dict;
  languages: Language[];
};

/* The words of one language: the admin's published edits over the bundled draft, English for anything missing. Only this language is loaded. */
export async function getI18n(lang?: string): Promise<I18n> {
  const code = lang ?? (await requestLang());
  const s = await languageSettings();
  const languages = liveLanguages(s);
  if (code === SOURCE)
    return { lang: SOURCE, dir: 'ltr', t: (k, v) => format(lookup(k, {}, {}), v), pick: (_k, english) => english, tx: (e, v) => txLookup(null, e, v), translate: (e) => e, clientDict: {}, languages };
  const [pub, bundle] = await Promise.all([publishedWords(code), bundled(code)]);
  const pick = (k: string, english: string) => (pub[k]?.trim() ? pub[k] : bundle[k]?.trim() ? bundle[k] : english);
  const word = (e: string) => (pub[TX_PREFIX + e]?.trim() ? pub[TX_PREFIX + e] : bundle[TX_PREFIX + e]?.trim() ? bundle[TX_PREFIX + e] : e);
  const clientDict: Dict = {};
  for (const e of clientStrings()) if (word(e) !== e) clientDict[e] = word(e);
  return { lang: code, dir: dirOf(s, code), t: (k, v) => format(lookup(k, pub, bundle), v), pick, tx: (e, v) => txLookup({ [e]: word(e) }, e, v), translate: word, clientDict, languages };
}
