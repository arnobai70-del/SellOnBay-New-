import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { englishCatalog, placeholderProblem, type Catalog } from './catalog';
import { BUILTIN, cleanLanguages, SOURCE, type LanguageSettings } from './config';
import { forgetLanguages, LANG_KEY, languageSettings, languagesMem } from './settingsRead';

/*
 * Admin › Language Management storage (owner, 2026-11-12), in app_settings (no migration): the language list under 'i18n:languages', and per
 * language the admin's words as a draft ('i18n:draft:<code>') and the published version ('i18n:pub:<code>'). Only published words reach
 * visitors, and only for a published language. Product words are keys like "product.<slug>.name" in the same documents. Every change is audited.
 */
type R<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const g = globalThis as { __i18nMem?: Map<string, unknown>; __i18nCache?: Map<string, { at: number; v: unknown }>; __i18nReady?: { ok: boolean; at: number } };
const mem = (g.__i18nMem ??= new Map());
const cache = (g.__i18nCache ??= new Map());
async function db(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  const r = g.__i18nReady;
  if (r && Date.now() - r.at < 60_000) return r.ok;
  const ok = !(await createAdminClient().from('app_settings').select('key').limit(1)).error;
  g.__i18nReady = { ok, at: Date.now() };
  return ok;
}
async function read<T>(key: string, fresh = false): Promise<T | null> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.v as T | null;
  let v: unknown = mem.get(key) ?? null;
  try {
    if (await db()) v = (await createAdminClient().from('app_settings').select('value').eq('key', key).maybeSingle()).data?.value ?? null;
  } catch {
    v = null; // a database problem shows English
  }
  cache.set(key, { at: Date.now(), v });
  return v as T | null;
}
async function write(key: string, value: unknown, by: string | null): Promise<boolean> {
  cache.delete(key);
  if (!(await db())) {
    mem.set(key, value);
    return true;
  }
  const { error } = await createAdminClient()
    .from('app_settings')
    .upsert({ key, value, changed_by: by && UUID.test(by) ? by : null, changed_at: new Date().toISOString() }, { onConflict: 'key' });
  return !error;
}
const refresh = () => {
  try {
    revalidatePath('/', 'layout');
  } catch {
    /* outside a request (tests) */
  }
};

const DRAFT = (lang: string) => `i18n:draft:${lang}`;
const PUB = (lang: string) => `i18n:pub:${lang}`;
const clean = (raw: unknown): Catalog => {
  const out: Catalog = {};
  if (raw && typeof raw === 'object')
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (/^[\w.+&'/ -]{1,200}$/.test(k) && typeof v === 'string' && v.trim()) out[k] = v.slice(0, 4000);
  return out;
};
export const publishedWords = async (lang: string): Promise<Catalog> => (lang === SOURCE ? {} : clean(await read(PUB(lang))));
export const draftWords = async (lang: string): Promise<Catalog> => clean(await read(DRAFT(lang)));

/* Save the admin's draft words for a language (merged into the existing draft; an empty value removes the word). Placeholders must match. */
export async function saveDraftWords(adminId: string | null, lang: string, words: Record<string, unknown>): Promise<R<Catalog>> {
  const s = await languageSettings();
  if (lang === SOURCE || !s.languages.some((l) => l.code === lang)) return fail(400, 'Choose a language to translate.');
  const en = englishCatalog();
  const existing = await draftWords(lang);
  const draft: Catalog = Object.keys(existing).length ? existing : await publishedWords(lang); // a first draft starts from what is published
  for (const [k, raw] of Object.entries(words).slice(0, 2000)) {
    if (!/^[\w.+&'/ -]{1,200}$/.test(k)) continue;
    const v = typeof raw === 'string' ? raw.trim().slice(0, 4000) : '';
    if (!v) {
      delete draft[k];
      continue;
    }
    if (en[k]) {
      const p = placeholderProblem(en[k], v);
      if (p) return fail(400, `${k}: ${p}`);
    } else if (!/^product\.[a-z0-9-]{1,120}\.(name|description|seoTitle|seoDescription)$/.test(k) && !/^seo\.\/[a-z0-9/-]{0,120}\.(title|description)$/.test(k)) continue; // known words, product words or page SEO words only
    draft[k] = v;
  }
  if (!(await write(DRAFT(lang), draft, adminId))) return fail(500, 'Could not save the draft.');
  await audit(adminId, 'i18n_draft_saved', 'language', lang, { words: Object.keys(words).length });
  return { ok: true, value: draft };
}

/* Publish the draft words of a language (visitors see them once the language itself is published), or take them back (unpublish). */
export async function publishWords(adminId: string | null, lang: string, action: 'publish' | 'unpublish'): Promise<R<number>> {
  if (lang === SOURCE) return fail(400, 'English is the source language.');
  if (action === 'unpublish') {
    if (!(await write(PUB(lang), {}, adminId))) return fail(500, 'Could not save.');
    await audit(adminId, 'i18n_words_unpublished', 'language', lang, {});
    refresh();
    return { ok: true, value: 0 };
  }
  const draft = await draftWords(lang);
  if (!(await write(PUB(lang), draft, adminId))) return fail(500, 'Could not publish.');
  await audit(adminId, 'i18n_words_published', 'language', lang, { words: Object.keys(draft).length });
  refresh();
  return { ok: true, value: Object.keys(draft).length };
}

/* Save the language list (enable, publish, order, names, direction, default; add or remove a language an admin added). */
export async function saveLanguages(adminId: string | null, raw: unknown): Promise<R<LanguageSettings>> {
  forgetLanguages();
  const before = await languageSettings();
  const next = cleanLanguages(raw);
  const removed = before.languages.filter((l) => !next.languages.some((n) => n.code === l.code)).map((l) => l.code);
  if (removed.some((c) => BUILTIN.some((b) => b.code === c))) return fail(400, 'Built-in languages cannot be removed; turn them off instead.');
  if (!(await write(LANG_KEY, next, adminId))) return fail(500, 'Could not save the languages.');
  languagesMem.value = next;
  forgetLanguages();
  const changed = next.languages
    .filter((l) => {
      const b = before.languages.find((x) => x.code === l.code);
      return !b || b.enabled !== l.enabled || b.published !== l.published;
    })
    .map((l) => `${l.code}:${l.enabled ? 'on' : 'off'}/${l.published ? 'published' : 'draft'}`);
  await audit(adminId, 'i18n_languages_saved', 'language', 'settings', { defaultLang: next.defaultLang, changed, removed });
  refresh();
  return { ok: true, value: next };
}
