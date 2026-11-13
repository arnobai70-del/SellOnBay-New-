'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { highlight } from '@/lib/searchCore';
import { localizedPath, splitLocale } from '@/lib/i18n/config';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/*
 * The smart search box (owner, 2026-11-08) for the top bar, the home hero, /websites and /help. It is a real form (GET to `action`), so it works
 * without JavaScript. With JavaScript: results after 2 characters (200 ms after typing stops), grouped by type, the matched part highlighted, up
 * and down to move, Enter to open, Escape to close, recent searches (in this browser only), and "no results" with suggestions and popular
 * categories. Two looks (owner, 2026-11-14: every search box suggests while typing): `bar` (the top bar's input) and `pill` (the big glass
 * search of the hero, /websites and /help, with its icon and button). Links open in the page's language.
 */
type Result = { href: string; title: string; sub?: string };
type Grouped = { q: string; websites: Result[]; sellers: Result[]; domain: Result | null; guides: Result[]; help: Result[]; total: number; didYouMean: string[]; popular: Result[] };
const RECENT = 'sob-recent-searches';
const readRecent = (): string[] => {
  try {
    return (JSON.parse(localStorage.getItem(RECENT) ?? '[]') as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 5);
  } catch {
    return [];
  }
};
const saveRecent = (q: string) => {
  try {
    localStorage.setItem(RECENT, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 5)));
  } catch {
    /* storage blocked: no recent searches, that is fine */
  }
};

function Marked({ text, q }: { text: string; q: string }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [s, e] of highlight(text, q)) {
    if (s > at) parts.push(text.slice(at, s));
    parts.push(<mark key={s}>{text.slice(s, e)}</mark>);
    at = e;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

export function SearchBox({
  action = '/search',
  label: labelGiven,
  placeholder: placeholderGiven,
  defaultValue = '',
  compact = false,
  track,
  hidden = {},
  variant = 'bar',
  inputId,
  button,
  maxWidth,
}: {
  hidden?: Record<string, string>;
  variant?: 'bar' | 'pill';
  inputId?: string; // a fixed id for the input (pages and tests address the big boxes as #q, #s, #hs)
  button?: React.ReactNode; // the pill's button text (default "Search")
  maxWidth?: number;
  action?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  compact?: boolean;
  track?: string;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const label = labelGiven ?? tx('Search websites, sellers, guides');
  const placeholder = placeholderGiven ?? tx('Search websites, sellers, guides');
  const router = useRouter();
  const id = useId();
  const qId = inputId ?? `${id}-q`;
  const lang = splitLocale(usePathname() ?? '/').lang ?? 'en';
  const here = (href: string) => (href.startsWith('/') ? localizedPath(href, lang) : href); // results open in the page's language
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Grouped | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const typed = q.trim();

  useEffect(() => {
    if (typed.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(typed)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: Grouped | null) => j && setData(j))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [typed]);

  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const shown = typed.length >= 2 && data?.q === typed ? data : null;
  const groups: [string, Result[]][] = shown
    ? (
        [
          [tx('Websites'), shown.websites],
          [tx('Sellers'), shown.sellers],
          [tx('Domains'), shown.domain ? [shown.domain] : []],
          [tx('Guides'), shown.guides],
          [tx('Help'), shown.help],
        ] as [string, Result[]][]
      ).filter(([, l]) => l.length)
    : [];
  const recentResults = recent.map((r) => ({ href: `${action}?q=${encodeURIComponent(r)}`, title: r }));
  // What the list shows, in order; the keyboard moves through exactly these.
  const sections: [string, Result[]][] = shown
    ? shown.total
      ? groups
      : [[tx('Popular categories'), shown.popular]]
    : typed.length < 2 && recentResults.length
      ? [[tx('Recent searches'), recentResults]]
      : [];
  const seeAll = shown ? [{ href: `${action}?q=${encodeURIComponent(typed)}`, title: tx('See all results') }] : [];
  const all = [...sections.flatMap(([, l]) => l), ...seeAll];
  const go = (href: string) => {
    if (typed) saveRecent(typed);
    setOpen(false);
    router.push(here(href));
  };
  let n = -1;
  const item = (r: Result, key: string) => {
    n++;
    const i = n;
    return (
      <li key={key} id={`${id}-o${i}`} role="option" aria-selected={active === i} className={active === i ? 'on' : undefined}>
        <a
          href={here(r.href)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            go(r.href);
          }}
        >
          <span className="sob-sx-t">
            <Marked text={r.title} q={typed} />
          </span>
          {r.sub && <span className="sob-sx-s">{r.sub}</span>}
        </a>
      </li>
    );
  };

  return (
    <div className={`sob-sx${compact ? ' sob-sx-compact' : ''}${variant === 'pill' ? ' sob-sx-pill' : ''}`} ref={box} style={maxWidth ? { maxWidth } : undefined}>
      <form
        className={variant === 'pill' ? 'glass search-glow' : undefined}
        action={here(action)}
        method="get"
        role="search"
        data-track={track}
        onSubmit={(e) => {
          if (active >= 0 && all[active]) {
            e.preventDefault();
            go(all[active].href);
          } else if (typed) saveRecent(typed);
        }}
      >
        <label className="hidden-label" htmlFor={qId}>
          {label}
        </label>
        {variant === 'pill' && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#566C78" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        )}
        <input
          id={qId}
          className={variant === 'pill' ? 'sob-sx-in' : 'input'}
          name="q"
          type="search"
          autoComplete="off"
          maxLength={80}
          placeholder={placeholder}
          value={q}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(all.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === 'Escape') {
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button className={variant === 'pill' ? 'btn' : 'btn sm'} type="submit">
          {button ?? <T s={'Search'} />}
        </button>
      </form>
      {open && all.length > 0 && (
        <div className="sob-sx-pop glass" id={`${id}-list`} role="listbox" aria-label={tx('Search suggestions')}>
          {shown && !shown.total && (
            <div className="sob-sx-none">
              <p>
                <T s={'No results for “{typed}”.'} v={{ typed }} />
              </p>
              {shown.didYouMean.length > 0 && (
                <p>
                  <T s={'Did you mean'} />{' '}
                  {shown.didYouMean.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <button type="button" className="sob-sx-link" onClick={() => setQ(s)}>
                        {s}
                      </button>
                    </span>
                  ))}
                  ?
                </p>
              )}
            </div>
          )}
          {sections.map(([name, list]) => (
            <div key={name}>
              <div className="sob-sx-h">{name}</div>
              <ul>{list.map((r) => item(r, `${name}-${r.href}`))}</ul>
            </div>
          ))}
          {seeAll.length > 0 && <ul className="sob-sx-all">{seeAll.map((r) => item(r, 'all'))}</ul>}
        </div>
      )}
    </div>
  );
}
