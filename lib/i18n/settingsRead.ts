import { supabaseConfigured, supabaseUrl } from '../supabase/env';
import { cleanLanguages, type LanguageSettings } from './config';

/*
 * The language settings for proxy.ts and the pages (same pattern as lib/seo/redirectRead.ts: proxy.ts cannot use the server client). Kept for
 * 30 seconds per server copy and forgotten at once after an admin's change on this copy. If the database cannot be read, the built-in
 * settings are used: English only for visitors (every other language starts unpublished), so a database problem never shows a draft.
 */
export const LANG_KEY = 'i18n:languages';
const g = globalThis as { __i18nLangMem?: { value: unknown }; __i18nLangCache?: { at: number; s: LanguageSettings } };
export const languagesMem = (g.__i18nLangMem ??= { value: null });
export const forgetLanguages = () => {
  g.__i18nLangCache = undefined;
};

export async function languageSettings(now = Date.now()): Promise<LanguageSettings> {
  const c = g.__i18nLangCache;
  if (c && now - c.at < 30_000) return c.s;
  let raw: unknown = languagesMem.value;
  if (supabaseConfigured && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const res = await fetch(`${supabaseUrl}/rest/v1/app_settings?select=value&key=eq.${encodeURIComponent(LANG_KEY)}`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(1_500),
      });
      raw = res.ok ? ((await res.json()) as { value: unknown }[])[0]?.value : c ? c.s : null;
    } catch {
      raw = c ? c.s : null;
    }
  }
  const s = cleanLanguages(raw);
  g.__i18nLangCache = { at: now, s };
  return s;
}
