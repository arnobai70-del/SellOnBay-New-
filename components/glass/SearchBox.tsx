'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { highlight } from '@/lib/searchCore';

/*
 * The smart search box (owner, 2026-11-08) for the top bar, the home hero and /websites. It is a real form (GET to `action`), so it works without
 * JavaScript. With JavaScript: results after 2 characters (200 ms after typing stops), grouped by type, the matched part highlighted, up and down
 * to move, Enter to open, Escape to close, recent searches (in this browser only), and "no results" with suggestions and popular categories.
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
  label = 'Search websites, sellers, guides',
  placeholder = 'Search websites, sellers, guides',
  defaultValue = '',
  compact = false,
  track,
  hidden = {},
}: {
  hidden?: Record<string, string>;
  action?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  compact?: boolean;
  track?: string;
}) {
  const router = useRouter();
  const id = useId();
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
          ['Websites', shown.websites],
          ['Sellers', shown.sellers],
          ['Domains', shown.domain ? [shown.domain] : []],
          ['Guides', shown.guides],
          ['Help', shown.help],
        ] as [string, Result[]][]
      ).filter(([, l]) => l.length)
    : [];
  const recentResults = recent.map((r) => ({ href: `${action}?q=${encodeURIComponent(r)}`, title: r }));
  // What the list shows, in order; the keyboard moves through exactly these.
  const sections: [string, Result[]][] = shown
    ? shown.total
      ? groups
      : [['Popular categories', shown.popular]]
    : typed.length < 2 && recentResults.length
      ? [['Recent searches', recentResults]]
      : [];
  const seeAll = shown ? [{ href: `/search?q=${encodeURIComponent(typed)}`, title: 'See all results' }] : [];
  const all = [...sections.flatMap(([, l]) => l), ...seeAll];
  const go = (href: string) => {
    if (typed) saveRecent(typed);
    setOpen(false);
    router.push(href);
  };
  let n = -1;
  const item = (r: Result, key: string) => {
    n++;
    const i = n;
    return (
      <li key={key} id={`${id}-o${i}`} role="option" aria-selected={active === i} className={active === i ? 'on' : undefined}>
        <a
          href={r.href}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            go(r.href);
          }}
        >
          <span className="g-sx-t">
            <Marked text={r.title} q={typed} />
          </span>
          {r.sub && <span className="g-sx-s">{r.sub}</span>}
        </a>
      </li>
    );
  };

  return (
    <div className={`g-sx${compact ? ' g-sx-compact' : ''}`} ref={box}>
      <form
        action={action}
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
        <label className="g-sr" htmlFor={`${id}-q`}>
          {label}
        </label>
        <input
          id={`${id}-q`}
          className="g-input"
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
        <button className="g-btn g-btn-sm" type="submit">
          Search
        </button>
      </form>
      {open && all.length > 0 && (
        <div className="g-sx-pop g-glass" id={`${id}-list`} role="listbox" aria-label="Search suggestions">
          {shown && !shown.total && (
            <div className="g-sx-none">
              <p>No results for &ldquo;{typed}&rdquo;.</p>
              {shown.didYouMean.length > 0 && (
                <p>
                  Did you mean{' '}
                  {shown.didYouMean.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ', '}
                      <button type="button" className="g-sx-link" onClick={() => setQ(s)}>
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
              <div className="g-sx-h">{name}</div>
              <ul>{list.map((r) => item(r, `${name}-${r.href}`))}</ul>
            </div>
          ))}
          {seeAll.length > 0 && <ul className="g-sx-all">{seeAll.map((r) => item(r, 'all'))}</ul>}
        </div>
      )}
    </div>
  );
}
