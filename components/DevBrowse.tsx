'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AREAS, LANGS, LEVELS, SKILLS, fromPrice, type Dev } from '@/lib/developers';
import { DevCard } from './DevParts';
import { DevHero } from './DevHero';

type Sort = 'best' | 'low' | 'rating' | 'orders';
const SORTS: [Sort, string][] = [
  ['best', 'Best match'],
  ['rating', 'Top rated'],
  ['orders', 'Most orders'],
  ['low', 'Lowest price'],
];
const BUDGETS: [string, string][] = [
  ['', 'Any budget'],
  ['60', 'Up to $60'],
  ['100', 'Up to $100'],
  ['200', 'Up to $200'],
];
const PAGE = 9;

/* Score for "best match": quality counts, brand-new developers get a small lift so they are seen. */
const score = (d: Dev) => (d.reviews ? d.rating * Math.min(1, 0.55 + d.reviews / 120) : 4.2) + (d.avail === 'Available now' ? 0.15 : d.avail === 'Booked' ? -0.4 : 0);

export function DevBrowse({ devs, initial }: { devs: Dev[]; initial: { lang?: string; area?: string; q?: string } }) {
  const [q, setQ] = useState(initial.q ?? '');
  const [lang, setLang] = useState<string>(initial.lang ?? '');
  const [skill, setSkill] = useState('');
  const [area, setArea] = useState<string>(initial.area ?? '');
  const [level, setLevel] = useState('');
  const [budget, setBudget] = useState('');
  const [ready, setReady] = useState(false);
  const [sort, setSort] = useState<Sort>('best');
  const [shown, setShown] = useState(PAGE);
  const [drawer, setDrawer] = useState(false);

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = devs.filter((d) => {
      if (lang && !d.langs.includes(lang)) return false;
      if (skill && !d.skills.some((s) => s.name === skill)) return false;
      if (area && !d.areas.includes(area)) return false;
      if (level && d.level !== level) return false;
      if (budget && fromPrice(d) > +budget) return false;
      if (ready && d.avail !== 'Available now') return false;
      const hay = [d.name, d.headline, d.gig, d.bio, ...d.langs, ...d.skills.map((s) => s.name), ...d.areas].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const by: Record<Sort, (a: Dev, b: Dev) => number> = {
      best: (a, b) => score(b) - score(a),
      rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
      orders: (a, b) => b.orders - a.orders,
      low: (a, b) => fromPrice(a) - fromPrice(b),
    };
    return out.sort(by[sort]);
  }, [devs, q, lang, skill, area, level, budget, ready, sort]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q) chips.push({ key: 'q', label: `"${q}"`, clear: () => setQ('') });
  if (lang) chips.push({ key: 'lang', label: lang, clear: () => setLang('') });
  if (skill) chips.push({ key: 'skill', label: skill, clear: () => setSkill('') });
  if (area) chips.push({ key: 'area', label: area, clear: () => setArea('') });
  if (level) chips.push({ key: 'level', label: level, clear: () => setLevel('') });
  if (budget) chips.push({ key: 'budget', label: `Up to $${budget}`, clear: () => setBudget('') });
  if (ready) chips.push({ key: 'ready', label: 'Available now', clear: () => setReady(false) });
  const reset = () => {
    setQ('');
    setLang('');
    setSkill('');
    setArea('');
    setLevel('');
    setBudget('');
    setReady(false);
  };
  const count = (f: (d: Dev) => boolean) => devs.filter(f).length;
  const radio = (name: string, val: string, cur: string, set: (v: string) => void, label: string, n?: number) => (
    <label key={val} className="opt-row">
      <input type="radio" name={name} checked={cur === val} onChange={() => set(val)} />
      <span>{label}</span>
      {n !== undefined && <em>{n}</em>}
    </label>
  );
  const usedLangs = LANGS.filter((l) => devs.some((d) => d.langs.includes(l)));
  const usedSkills = SKILLS.filter((s) => devs.some((d) => d.skills.some((k) => k.name === s)));

  return (
    <div data-browse data-devs>
      <DevHero devs={devs}>
        <div className="bsearch-wrap">
          <label className="search bsearch">
            <span className="sr">Search developers</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5E6485" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Language or skill" autoComplete="off" />
            {q && (
              <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>
                Clear
              </button>
            )}
            <span className="pop">
              Popular:{' '}
              {['Flutter', 'Next.js', 'WordPress', 'Laravel'].map((w, i) => (
                <span key={w}>
                  <button type="button" onClick={() => setQ(w)}>
                    {w}
                  </button>
                  {i < 3 ? ', ' : ''}
                </span>
              ))}
            </span>
          </label>
        </div>
      </DevHero>

      <div className="wrap">
        <div className="bl">
          <aside className={'bl-side' + (drawer ? ' open' : '')} aria-label="Filters">
            <div className="bl-side-head">
              <h2>Filters</h2>
              <button type="button" className="pv-x" aria-label="Close filters" onClick={() => setDrawer(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <fieldset>
              <legend>What do you need</legend>
              {radio('area', '', area, setArea, 'Anything')}
              {AREAS.map((a) =>
                radio(
                  'area',
                  a,
                  area,
                  setArea,
                  a,
                  count((d) => d.areas.includes(a)),
                ),
              )}
            </fieldset>
            <fieldset>
              <legend>Language</legend>
              {radio('lang', '', lang, setLang, 'Any language')}
              {usedLangs.map((l) =>
                radio(
                  'lang',
                  l,
                  lang,
                  setLang,
                  l,
                  count((d) => d.langs.includes(l)),
                ),
              )}
            </fieldset>
            <fieldset>
              <legend>Framework or skill</legend>
              {radio('skill', '', skill, setSkill, 'Any')}
              {usedSkills.map((s) =>
                radio(
                  'skill',
                  s,
                  skill,
                  setSkill,
                  s,
                  count((d) => d.skills.some((k) => k.name === s)),
                ),
              )}
            </fieldset>
            <fieldset>
              <legend>Budget</legend>
              {BUDGETS.map(([v, l]) => radio('budget', v, budget, setBudget, l))}
            </fieldset>
            <fieldset>
              <legend>Seller level</legend>
              {radio('level', '', level, setLevel, 'Any level')}
              {LEVELS.map((l) =>
                radio(
                  'level',
                  l,
                  level,
                  setLevel,
                  l,
                  count((d) => d.level === l),
                ),
              )}
            </fieldset>
            <fieldset>
              <legend>Availability</legend>
              <label className="opt-row">
                <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} />
                <span>Available now</span>
                <em>{count((d) => d.avail === 'Available now')}</em>
              </label>
            </fieldset>
            <div className="bl-side-foot">
              <button type="button" className="btn btn-line btn-sm" onClick={reset} disabled={!chips.length}>
                Clear all
              </button>
              <button type="button" className="btn btn-blue btn-sm" onClick={() => setDrawer(false)}>
                Show {list.length}
              </button>
            </div>
          </aside>
          {drawer && <button type="button" className="bl-scrim" aria-label="Close filters" onClick={() => setDrawer(false)} />}

          <div className="bl-main">
            <div className="bl-bar">
              <p className="muted" aria-live="polite">
                <b>{list.length}</b> {list.length === 1 ? 'developer' : 'developers'}
                {list.length !== devs.length && <> of {devs.length}</>}
              </p>
              <div className="bl-bar-r">
                <Link className="btn btn-line btn-sm dv-join-btn" href="/developers/join">
                  Become a developer
                </Link>
                <button type="button" className="btn btn-line btn-sm bl-fbtn" onClick={() => setDrawer(true)}>
                  Filters{chips.length ? ` (${chips.length})` : ''}
                </button>
                <label>
                  <span className="sr">Sort</span>
                  <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    {SORTS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {chips.length > 0 && (
              <div className="bl-chips" aria-label="Active filters">
                {chips.map((c) => (
                  <button key={c.key} type="button" className="fchip" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
                    {c.label}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                ))}
                <button type="button" className="reset" onClick={reset}>
                  Clear all
                </button>
              </div>
            )}
            <div className="dv-grid">
              {list.length ? (
                list.slice(0, shown).map((d) => <DevCard key={d.id} dev={d} />)
              ) : (
                <div className="empty bl-empty" style={{ gridColumn: '1/-1' }}>
                  <b>No developers match these filters</b>
                  <p>Try fewer filters or a different word.</p>
                  <div className="bl-empty-btns">
                    <button type="button" className="btn btn-blue btn-sm" onClick={reset}>
                      Clear all filters
                    </button>
                  </div>
                </div>
              )}
            </div>
            {list.length > shown && (
              <div className="bl-more">
                <button type="button" className="btn btn-line" onClick={() => setShown((n) => n + PAGE)}>
                  Show more ({list.length - shown} left)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
