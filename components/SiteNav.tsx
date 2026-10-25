'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MARKET_MENU, type MenuEntry } from '@/lib/marketMenu';
import { useList } from '@/lib/saved';
import { KINDS, KIND_LABEL, MIN_QUERY, type Hit } from '@/lib/siteSearchCore';
import { legacyPublic } from '@/lib/legacy';
import { SHELF_OPTIONS } from '@/lib/storeShelves';
import { SearchMark } from './SearchMark';
import { Logo } from './Logo';

/* Which category-bar entry a page belongs to, from the key SiteNavByPath picks. */
const ENTRY_OF: Record<string, string> = { browse: 'web', find: 'web', domains: 'web', webapp: 'web', how: 'help', apps: 'apps', android: 'apps', ios: 'apps', desktop: 'apps', digital: '' };
const entryFor = (active: string) => ENTRY_OF[active] ?? active;

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const Heart = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />
  </svg>
);
const Person = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </svg>
);

/* One wide panel under the category bar: groups of links side by side and a feature card at the end. */
function Panel({ e, done }: { e: MenuEntry; done: () => void }) {
  return (
    <div className="mk-panel-in wrap">
      {e.groups.map((g) => (
        <div key={g.title} className="mk-group">
          <p className="mk-group-h">{g.title}</p>
          {g.all && (
            <Link className="mk-all" href={g.all[1]} onClick={done}>
              {g.all[0]}
            </Link>
          )}
          <ul>
            {g.links.map(([label, href]) => (
              <li key={href}>
                <Link href={href} onClick={done}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {e.feature && (
        <Link className="mk-feature" href={e.feature.href} onClick={done}>
          <b>{e.feature.title}</b>
          <span>{e.feature.text}</span>
          <em>{e.feature.cta}</em>
        </Link>
      )}
    </div>
  );
}

/*
 * The top bar of every public page, in the marketplace layout: logo, a big search with a shelf picker and the account links on the first row;
 * the category bar with one wide panel per entry on the second. On a wide screen a panel opens when the mouse arrives and closes a moment after it
 * leaves; touch and the keyboard use the button. Under 1024px the first row folds, the categories become a row you can swipe, the menu button opens
 * a full-height sheet, and a tab bar sits at the bottom of the screen.
 */
export function SiteNav({ active = '', dashHref, menu = MARKET_MENU }: { active?: string; dashHref?: string; menu?: MenuEntry[] }) {
  const path = usePathname();
  const router = useRouter();
  const on = entryFor(active);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [q, setQ] = useState('');
  // On a shelf the search stays on that shelf; anywhere else it searches the whole site (/search).
  const shelfOfPage = SHELF_OPTIONS.find(([href]) => path === href)?.[0] ?? '/search';
  const [hits, setHits] = useState<Omit<Hit, 'score'>[] | null>(null);
  const [focus, setFocus] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [shelf, setShelf] = useState(shelfOfPage);
  const saved = useList('saved').length;
  const box = useRef<HTMLElement>(null);
  const pointer = useRef('mouse'); // what the last press was made with, so a tap toggles but a mouse click on an open panel keeps it open
  const leave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wide = () => matchMedia('(min-width: 1024px)').matches;

  useEffect(() => {
    setOpen(null);
    setSheet(false);
    setFocus(false);
    setShelf(shelfOfPage);
  }, [path, shelfOfPage]);
  useEffect(() => {
    const f = () => setScrolled(scrollY > 4);
    f();
    addEventListener('scroll', f, { passive: true });
    return () => removeEventListener('scroll', f);
  }, []);
  // Panels close on Escape and on a click elsewhere; the sheet also locks the page behind it.
  useEffect(() => {
    if (!open && !sheet) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null);
        setSheet(false);
      }
    };
    const out = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(null);
    };
    addEventListener('keydown', key);
    addEventListener('mousedown', out);
    return () => {
      removeEventListener('keydown', key);
      removeEventListener('mousedown', out);
    };
  }, [open, sheet]);
  // Results as you type: the best few of each kind from the whole site, a moment after the last key.
  const term = q.trim();
  useEffect(() => {
    if (term.length < MIN_QUERY) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch('/api/search?q=' + encodeURIComponent(term), { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setHits(j.hits))
        .catch(() => {});
    }, 180);
    return () => (clearTimeout(t), ctl.abort());
  }, [term]);
  useEffect(() => {
    if (!focus) return;
    const out = (e: MouseEvent) => {
      if (!form.current?.contains(e.target as Node)) setFocus(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(false);
    addEventListener('mousedown', out);
    addEventListener('keydown', key);
    return () => (removeEventListener('mousedown', out), removeEventListener('keydown', key));
  }, [focus]);
  const showHits = focus && term.length >= MIN_QUERY && hits !== null;

  useEffect(() => {
    document.documentElement.classList.toggle('sheet-open', sheet);
    return () => document.documentElement.classList.remove('sheet-open');
  }, [sheet]);

  const done = () => {
    setOpen(null);
    setSheet(false);
  };
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    setFocus(false);
    router.push(shelf + (t ? '?q=' + encodeURIComponent(t) : ''));
  };
  const hoverOpen = (k: string) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !wide()) return;
    clearTimeout(leave.current);
    setOpen(k);
  };
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leave.current);
    leave.current = setTimeout(() => setOpen(null), 220);
  };
  const account = dashHref ?? '/login';
  const accountLabel = dashHref ? 'My dashboard' : 'Sign in';

  return (
    <header ref={box} className={'mk-hdr' + (scrolled ? ' scrolled' : '') + (sheet ? ' open' : '')}>
      <div className="wrap mk-top">
        <button type="button" className="mk-burger" aria-label={sheet ? 'Close menu' : 'Open menu'} aria-expanded={sheet} aria-controls="mk-sheet" onClick={() => setSheet((o) => !o)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {sheet ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        <Logo />
        <form ref={form} className="mk-search" role="search" onSubmit={go} onFocus={() => setFocus(true)}>
          <label className="sr-only" htmlFor="mk-shelf">
            Where to search
          </label>
          <select id="mk-shelf" value={shelf} onChange={(e) => setShelf(e.target.value)}>
            {SHELF_OPTIONS.map(([href, label]) => (
              <option key={href} value={href}>
                {label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="mk-q">
            Search
          </label>
          <input
            id="mk-q"
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={legacyPublic() ? 'Search websites, apps and more' : 'Search website templates'}
            autoComplete="off"
            aria-describedby={showHits ? 'mk-hits' : undefined}
          />
          <button type="submit" aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          {showHits && (
            <div id="mk-hits" className="mk-hits" aria-label="Search results">
              {hits.length === 0 ? (
                <p className="mk-hits-none">Nothing found for “{term}”.</p>
              ) : (
                KINDS.filter((k) => hits.some((h) => h.kind === k)).map((k) => (
                  <div key={k} className="mk-hits-group">
                    <b>{KIND_LABEL[k]}</b>
                    {hits
                      .filter((h) => h.kind === k)
                      .map((h) => (
                        <a key={h.href + h.title} href={h.href} onClick={() => setFocus(false)}>
                          <span>
                            <SearchMark text={h.title} q={term} />
                          </span>
                          {(h.kind === 'page' || h.kind === 'post') && h.snippet ? (
                            <small>
                              <SearchMark text={h.snippet} q={term} />
                            </small>
                          ) : (
                            h.sub && <small>{h.sub}</small>
                          )}
                        </a>
                      ))}
                  </div>
                ))
              )}
              <Link className="mk-hits-all" href={'/search?q=' + encodeURIComponent(term)} onClick={() => setFocus(false)}>
                See all results for “{term}”
              </Link>
            </div>
          )}
        </form>
        <div className="mk-end">
          {legacyPublic() && (
            <Link className="mk-ico" href="/browse?saved=1" aria-label={`Saved${saved ? `, ${saved}` : ''}`}>
              <Heart />
              {saved > 0 && <i>{saved}</i>}
            </Link>
          )}
          <Link className={'mk-ico mk-ico-acct' + (dashHref ? '' : ' mk-ico-guest')} href={dashHref ?? (legacyPublic() ? '/guest' : '/login')} aria-label={dashHref ? accountLabel : 'Your visit'}>
            <Person />
          </Link>
          <Link className="mk-sell" href="/sell" aria-current={active === 'sell' ? 'page' : undefined}>
            Sell on SellOnBay
          </Link>
          <Link className="btn btn-gold btn-sm mk-acct" href={account}>
            {accountLabel}
          </Link>
        </div>
      </div>

      <nav className="mk-cats" aria-label="Categories" onPointerLeave={hoverClose} onPointerEnter={() => clearTimeout(leave.current)}>
        <div className="wrap mk-cats-in">
          {menu.map((e) => (
            <div key={e.key} className={'mk-cat' + (open === e.key ? ' open' : '')} onPointerEnter={hoverOpen(e.key)}>
              <Link className="mk-cat-link" href={e.href} aria-current={on === e.key ? 'page' : undefined} onClick={done}>
                {e.label}
              </Link>
              {e.groups.length > 0 && (
                <button
                  type="button"
                  className="mk-cat-btn"
                  aria-label={`${e.label} menu`}
                  aria-expanded={open === e.key}
                  aria-controls={`mk-panel-${e.key}`}
                  onPointerDown={(ev) => (pointer.current = ev.pointerType)}
                  onClick={(ev) => setOpen((v) => (ev.detail > 0 && pointer.current === 'mouse' && wide() ? e.key : v === e.key ? null : e.key))} // detail 0 is a key press: that toggles
                >
                  <Chevron />
                </button>
              )}
              {e.groups.length > 0 && (
                <div className="mk-panel" id={`mk-panel-${e.key}`} hidden={open !== e.key}>
                  <Panel e={e} done={done} />
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>

      <div className="mk-sheet" id="mk-sheet" hidden={!sheet}>
        {menu.map((e) =>
          e.groups.length === 0 ? (
            <Link key={e.key} className="mk-acc" href={e.href} onClick={done} aria-current={on === e.key ? 'page' : undefined} style={{ display: 'block', padding: '14px 4px', fontWeight: 700 }}>
              {e.label}
            </Link>
          ) : (
            <details key={e.key} className="mk-acc" open={on === e.key || undefined}>
              <summary>{e.label}</summary>
              {e.groups.map((g) => (
                <div key={g.title} className="mk-acc-g">
                  <p className="mk-group-h">{g.title}</p>
                  {g.all && (
                    <Link className="mk-all" href={g.all[1]} onClick={done}>
                      {g.all[0]}
                    </Link>
                  )}
                  {g.links.map(([label, href]) => (
                    <Link key={href} href={href} onClick={done}>
                      {label}
                    </Link>
                  ))}
                </div>
              ))}
            </details>
          ),
        )}
        <div className="mk-sheet-cta">
          <Link className="btn btn-line" href={account} onClick={done}>
            {accountLabel}
          </Link>
          <Link className="btn btn-gold" href="/sell" onClick={done}>
            Sell on SellOnBay
          </Link>
        </div>
      </div>

      <nav className="mk-tabs" aria-label="Quick links">
        <Link href="/" aria-current={path === '/' ? 'page' : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
          </svg>
          Home
        </Link>
        <Link href={legacyPublic() ? '/categories' : '/templates/saas'} aria-current={path === '/categories' ? 'page' : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
            <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
            <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
            <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
          </svg>
          Categories
        </Link>
        {legacyPublic() && (
          <Link href="/browse?saved=1">
            <Heart />
            Saved
          </Link>
        )}
        <Link href="/sell" aria-current={path === '/sell' ? 'page' : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Sell
        </Link>
        <Link href={dashHref ?? (legacyPublic() ? '/guest' : '/login')} aria-current={path.startsWith('/guest') || path.startsWith('/login') ? 'page' : undefined}>
          <Person />
          {dashHref ? 'Account' : 'You'}
        </Link>
      </nav>
    </header>
  );
}
