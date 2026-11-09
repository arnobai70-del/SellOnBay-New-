'use client';

import { useState } from 'react';

/* The home hero's search of design-reference/index.html: the Websites / Domains tabs pick where the same box searches (GET forms, so it works without JS). */
export function HeroSearch({ placeholder }: { placeholder: string }) {
  const [tab, setTab] = useState<'websites' | 'domains'>('websites');
  const sites = tab === 'websites';
  return (
    <>
      <div
        className="fade-in"
        role="tablist"
        aria-label="Search type"
        style={{ display: 'flex', padding: 4, borderRadius: 999, background: 'rgba(255,255,255,.6)', border: '1px solid #DCE7EC', marginTop: 8, animationDelay: '.55s' }}
      >
        <button type="button" role="tab" aria-selected={sites} className={sites ? 'stab on' : 'stab'} onClick={() => setTab('websites')}>
          Websites
        </button>
        <button type="button" role="tab" aria-selected={!sites} className={sites ? 'stab' : 'stab on'} onClick={() => setTab('domains')}>
          Domains
        </button>
      </div>
      <form
        className="glass search-glow"
        style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 680, padding: '8px 8px 8px 22px', borderRadius: 999, boxSizing: 'border-box' }}
        action={sites ? '/websites' : '/domains'}
        method="get"
        role="search"
        data-track="hero-search"
      >
        <label htmlFor="q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {sites ? 'Search websites' : 'Search a domain'}
        </label>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#566C78" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="q"
          name="q"
          placeholder={sites ? `${placeholder}…` : 'yourbrand.com'}
          style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '15px var(--font-inter), Inter, sans-serif', color: '#2B4250', outline: 'none', minHeight: 44 }}
        />{' '}
        <button className="btn" type="submit">
          {sites ? 'Search websites' : 'Search domains'}
        </button>
      </form>
    </>
  );
}
