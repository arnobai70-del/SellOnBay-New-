import 'server-only';
import type { Metadata } from 'next';
import { SITE_URL } from '../site';
import { localizedPath, SOURCE, type Language } from './config';
import { getI18n } from './server';

/*
 * Search engines and languages (owner, 2026-11-12): each public page tells them its address in every live language (hreflang) and that
 * English is the default (x-default); a page in another language names its own address as canonical, so the languages never count as
 * duplicates and the English addresses keep their rankings. Only live languages are listed: a draft language is never announced.
 */
export function alternateLanguages(path: string, languages: Language[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (languages.length < 2) return out; // English only: nothing to announce
  for (const l of languages) out[l.code] = SITE_URL + localizedPath(path, l.code);
  out['x-default'] = SITE_URL + localizedPath(path, SOURCE);
  return out;
}

/*
 * A public page's metadata in the request's language: its own canonical, the alternates, the share card's locale, and translated SEO words.
 * `address` is the page's public address when its words are kept under another key (a category's words live under /templates/<slug>, its
 * page is /websites/category/<ending>): the canonical and hreflang links always use the public address, never a redirecting key.
 */
export async function localizeMetadata(path: string, meta: Metadata, address: string = path): Promise<Metadata> {
  const i = await getI18n();
  const languages = alternateLanguages(address, i.languages);
  if (i.lang === SOURCE) return Object.keys(languages).length ? { ...meta, alternates: { ...meta.alternates, languages } } : meta;
  const canonical = localizedPath(address, i.lang);
  const title = i.pick(`seo.${path}.title`, '');
  const description = i.pick(`seo.${path}.description`, '');
  return {
    ...meta,
    ...(title ? { title: { absolute: title } } : {}),
    ...(description ? { description } : {}),
    alternates: { ...meta.alternates, canonical, languages },
    openGraph: { ...meta.openGraph, url: canonical, locale: i.lang, ...(title ? { title } : {}), ...(description ? { description } : {}) },
  };
}
