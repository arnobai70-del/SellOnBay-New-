/*
 * Languages (owner, 2026-11-12). Pure and tested: the built-in languages, the language settings an admin edits (Admin › Language Management,
 * stored in app_settings 'i18n:languages'), and the address rules. English is the default and keeps today's addresses with no prefix, so
 * existing links and rankings stay; every other language lives under /<code>/… on the public pages. Dashboards and admin keep their
 * addresses and follow the visitor's saved choice (cookie sob_lang).
 * A language is shown to visitors only when it is enabled AND published; until then its translations are drafts and nobody sees them.
 */
export type Dir = 'ltr' | 'rtl';
export type Language = { code: string; name: string; native: string; dir: Dir; enabled: boolean; published: boolean; order: number };
export type LanguageSettings = { defaultLang: string; languages: Language[] };

export const BUILTIN: Language[] = [
  { code: 'en', name: 'English', native: 'English', dir: 'ltr', enabled: true, published: true, order: 0 },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr', enabled: true, published: false, order: 1 },
  { code: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', enabled: true, published: false, order: 2 },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', enabled: true, published: false, order: 3 },
  { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr', enabled: true, published: false, order: 4 },
  { code: 'fr', name: 'French', native: 'Français', dir: 'ltr', enabled: true, published: false, order: 5 },
  { code: 'de', name: 'German', native: 'Deutsch', dir: 'ltr', enabled: true, published: false, order: 6 },
  { code: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr', enabled: true, published: false, order: 7 },
];
export const SOURCE = 'en'; // the language the code is written in; every other one falls back to it
export const COOKIE = 'sob_lang';
export const HEADER = 'x-sob-lang';
export const isCode = (v: unknown): v is string => typeof v === 'string' && /^[a-z]{2}(-[a-z]{2})?$/.test(v);

/* Saved settings (or an admin's form), cleaned: English always exists, is enabled and published; codes are unique; unknown fields dropped. */
export function cleanLanguages(raw: unknown): LanguageSettings {
  const r = (raw ?? {}) as { defaultLang?: unknown; languages?: unknown };
  const given = Array.isArray(r.languages) ? r.languages : [];
  const seen = new Set<string>();
  const list: Language[] = [];
  for (const x of [...given, ...BUILTIN] as Record<string, unknown>[]) {
    const code = String(x?.code ?? '').toLowerCase();
    if (!isCode(code) || seen.has(code)) continue;
    seen.add(code);
    const base = BUILTIN.find((b) => b.code === code);
    const str = (v: unknown, d: string, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d);
    list.push({
      code,
      name: str(x.name, base?.name ?? code, 40),
      native: str(x.native, base?.native ?? code, 40),
      dir: x.dir === 'rtl' ? 'rtl' : x.dir === 'ltr' ? 'ltr' : (base?.dir ?? 'ltr'),
      enabled: code === SOURCE ? true : typeof x.enabled === 'boolean' ? x.enabled : (base?.enabled ?? false),
      published: code === SOURCE ? true : typeof x.published === 'boolean' ? x.published : (base?.published ?? false),
      order: Number.isInteger(x.order) ? Number(x.order) : (base?.order ?? 100),
    });
  }
  list.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  const live = list.filter((l) => l.enabled && l.published).map((l) => l.code);
  const defaultLang = isCode(r.defaultLang) && live.includes(r.defaultLang) ? r.defaultLang : SOURCE;
  return { defaultLang, languages: list.slice(0, 30) };
}

/* The languages visitors may use: enabled and published, in the admin's order. */
export const liveLanguages = (s: LanguageSettings) => s.languages.filter((l) => l.enabled && l.published);
export const dirOf = (s: LanguageSettings, code: string): Dir => s.languages.find((l) => l.code === code)?.dir ?? 'ltr';

/*
 * The public pages that have a translated address (/bn/…). Everything else (dashboards, admin, APIs, checkout steps behind sign-in) keeps one
 * address and follows the saved choice. A test keeps this list in step with app/(glass).
 */
export const PUBLIC_ROOTS = [
  '/affiliates',
  '/buyer-protection',
  '/domains',
  '/guides',
  '/help',
  '/legal',
  '/sell',
  '/sellers',
  '/signin',
  '/subscriptions',
  '/websites',
  '/reset-password',
  '/verify-email',
  '/two-factor',
  '/cart',
  '/feedback',
];
export const isPublicPath = (path: string) => path === '/' || PUBLIC_ROOTS.some((r) => path === r || path.startsWith(r + '/'));

/* /bn/websites -> { lang: 'bn', path: '/websites' }; /websites -> { lang: null, path: '/websites' }. Only codes that look like languages. */
export function splitLocale(path: string): { lang: string | null; path: string } {
  const m = path.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/.*)?$/);
  if (!m || !isCode(m[1])) return { lang: null, path };
  return { lang: m[1], path: m[2] || '/' };
}
/* The address of a public page in a language: English (the source) has no prefix. Non-public addresses never get one. */
export function localizedPath(path: string, lang: string): string {
  const s = splitLocale(path);
  const base = s.lang && isPublicPath(s.path) && !isPublicPath(path) ? s.path : path; // drop a language prefix it already has
  if (lang === SOURCE || !isPublicPath(base)) return base;
  return base === '/' ? `/${lang}` : `/${lang}${base}`;
}

/* The visitor's preferred language from Accept-Language, among the live ones (for a suggestion, never an automatic redirect). */
export function fromAcceptLanguage(header: string | null | undefined, live: string[]): string | null {
  for (const part of (header ?? '').split(',')) {
    const code = part.split(';')[0].trim().toLowerCase();
    if (!code) continue;
    if (live.includes(code)) return code;
    const short = code.slice(0, 2);
    if (live.includes(short)) return short;
  }
  return null;
}
