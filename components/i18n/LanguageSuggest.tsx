'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { COOKIE, fromAcceptLanguage, localizedPath } from '@/lib/i18n/config';

export type Suggestion = { code: string; native: string; dir: 'ltr' | 'rtl'; message: string; yes: string; no: string };

/*
 * A one-line offer of the visitor's own language (i18n phase 2): shown on an English page only when the browser prefers a published language
 * and the visitor has never chosen one (no sob_lang cookie). It never redirects by itself. "Keep English" saves English as the choice, so the
 * offer does not come back; the other button opens the same page in that language, like the switcher. Its words are in the offered language.
 */
export function LanguageSuggest({ suggestions }: { suggestions: Suggestion[] }) {
  const path = usePathname() ?? '/';
  const [offer, setOffer] = useState<Suggestion | null>(null);
  useEffect(() => {
    if (!suggestions.length || new RegExp(`(?:^|;\\s*)${COOKIE}=`).test(document.cookie)) return;
    const code = fromAcceptLanguage(
      (navigator.languages ?? [navigator.language]).join(','),
      suggestions.map((s) => s.code),
    );
    const found = suggestions.find((s) => s.code === code) ?? null;
    if (found) setOffer(found); // eslint-disable-line react-hooks/set-state-in-effect -- the browser's languages are only known after mount
  }, [suggestions]);
  if (!offer) return null;
  const choose = (code: string) => {
    document.cookie = `${COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    void fetch('/api/account/language', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: code }), keepalive: true }).catch(() => {});
  };
  return (
    <p className="sob-note" role="region" aria-label={offer.native} lang={offer.code} dir={offer.dir} data-lang-suggest={offer.code}>
      {offer.message}{' '}
      <button
        type="button"
        className="btn"
        onClick={() => {
          choose(offer.code);
          window.location.assign(localizedPath(path, offer.code) + window.location.search + window.location.hash);
        }}
      >
        {offer.yes}
      </button>{' '}
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          choose('en');
          setOffer(null);
        }}
      >
        {offer.no}
      </button>
    </p>
  );
}
