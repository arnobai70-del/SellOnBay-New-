'use client';

import { usePathname } from 'next/navigation';
import { COOKIE, localizedPath, splitLocale } from '@/lib/i18n/config';

/*
 * The language choice (owner, 2026-11-12) in the top bar, the footer and the dashboards. It remembers the choice in this browser (cookie
 * sob_lang, a year, kept through sign-in and sign-out), saves it to the account when signed in, and opens the same page in that language:
 * public pages have their own address per language, dashboards reload in place. Only live languages are offered (the server decides).
 */
export function LanguageSwitcher({ languages, current, label, id = 'lang' }: { languages: { code: string; native: string }[]; current: string; label: string; id?: string }) {
  const path = usePathname() ?? '/';
  if (languages.length < 2) return null; // nothing to choose until an admin publishes a second language
  return (
    <span className="sob-lang">
      <label htmlFor={id} className="hidden-label">
        {label}
      </label>
      <select
        id={id}
        className="input"
        value={current}
        style={{ width: 'auto', minWidth: 110, borderRadius: 999 }}
        onChange={(e) => {
          const code = e.target.value;
          document.cookie = `${COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          void fetch('/api/account/language', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: code }), keepalive: true }).catch(() => {});
          const bare = splitLocale(path).lang && languages.some((l) => l.code === splitLocale(path).lang) ? splitLocale(path).path : path;
          const to = localizedPath(bare, code);
          if (to !== path) window.location.assign(to + window.location.search + window.location.hash);
          else window.location.reload();
        }}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </span>
  );
}
