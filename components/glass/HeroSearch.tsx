'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { localizedPath, splitLocale } from '@/lib/i18n/config';
import { SearchBox } from './SearchBox';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* The home hero's search of design-reference/index.html: the Websites / Domains tabs pick where the same box searches (GET forms, so it works without JS).
   Websites suggests while typing (SearchBox, owner 2026-11-14); Domains stays a plain domain-name form. */
export function HeroSearch({ placeholder }: { placeholder: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [tab, setTab] = useState<'websites' | 'domains'>('websites');
  const sites = tab === 'websites';
  const lang = splitLocale(usePathname() ?? '/').lang ?? 'en'; // the results open in the page's language
  return (
    <>
      <div
        className="fade-in"
        role="tablist"
        aria-label={tx('Search type')}
        style={{ display: 'flex', padding: 4, borderRadius: 999, background: 'rgba(255,255,255,.6)', border: '1px solid #DCE7EC', marginTop: 8, animationDelay: '.55s' }}
      >
        <button type="button" role="tab" aria-selected={sites} className={sites ? 'stab on' : 'stab'} onClick={() => setTab('websites')}>
          <T s={'Websites'} />
        </button>
        <button type="button" role="tab" aria-selected={!sites} className={sites ? 'stab' : 'stab on'} onClick={() => setTab('domains')}>
          <T s={'Domains'} />
        </button>
      </div>
      {sites ? (
        <SearchBox
          variant="pill"
          inputId="q"
          action="/websites"
          track="hero-search"
          maxWidth={680}
          label={tx('Search websites')}
          placeholder={`${placeholder}…`}
          button={
            <>
              <span className="sob-hide-sm">{tx('Search websites')}</span>
              <span className="sob-show-sm">{tx('Search')}</span>
            </>
          }
        />
      ) : (
        <form
          className="glass search-glow"
          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 680, padding: '8px 8px 8px 22px', borderRadius: 999, boxSizing: 'border-box' }}
          action={localizedPath('/domains', lang)}
          method="get"
          role="search"
          data-track="hero-search"
        >
          <label htmlFor="q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {tx('Search a domain')}
          </label>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#566C78" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="q"
            name="q"
            placeholder="yourbrand.com"
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '15px var(--font-inter), Inter, sans-serif', color: '#2B4250', outline: 'none', minHeight: 44 }}
          />{' '}
          <button className="btn" type="submit">
            <span className="sob-hide-sm">{tx('Search domains')}</span>
            <span className="sob-show-sm">{tx('Search')}</span>
          </button>
        </form>
      )}
    </>
  );
}
