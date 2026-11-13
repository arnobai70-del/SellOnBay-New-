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
      {/* A real <select> (keyboard, screen readers, the phone's own picker), styled as the bar's pill buttons in app/sob-parts.css */}
      <svg className="sob-lang-globe" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <select
        id={id}
        className="sob-lang-select"
        value={current}
        title={label}
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
