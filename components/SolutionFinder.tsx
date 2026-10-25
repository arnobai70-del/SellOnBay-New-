'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { THEMES, daysLabel, imageFor, money, type Product, type ThemeKey } from '@/lib/data';
import { SHOW_LIST_PRICES } from '@/lib/config';

/*
 * One click gives answers. Pick what you do and the best sites show up straight away; the two extra choices only sharpen
 * the list and can be skipped, changed or switched off at any time. Choosing a different business starts them fresh. No steps, no Back button, nothing to reset.
 */
type Biz = { key: string; label: string; cats: string[]; theme: ThemeKey; photo: string };
const BIZ: Biz[] = [
  { key: 'food', label: 'Restaurant or cafe', cats: ['Restaurants'], theme: 'restaurant', photo: 'saffron-table' },
  { key: 'health', label: 'Clinic or gym', cats: ['Health'], theme: 'clinic', photo: 'clinic-desk' },
  { key: 'folio', label: 'Portfolio or personal brand', cats: ['Portfolios'], theme: 'portfolio', photo: 'folio-studio' },
  { key: 'shop', label: 'Online shop', cats: ['Stores'], theme: 'store', photo: 'shopline' },
  { key: 'launch', label: 'Startup or service', cats: ['Landing pages'], theme: 'saas', photo: 'leadform' },
  { key: 'home', label: 'Real estate', cats: ['Real estate'], theme: 'estate', photo: 'brickwork' },
  { key: 'tool', label: 'Software or tool', cats: ['Tools'], theme: 'tool', photo: 'invoicer' },
  { key: 'other', label: 'Not sure, show me the best', cats: [], theme: 'bio', photo: 'bioboard' },
];

const GOALS: { key: string; label: string; does: string }[] = [
  { key: 'book', label: 'Take bookings', does: 'book' },
  { key: 'sell', label: 'Sell products', does: 'sell' },
  { key: 'show', label: 'Show my work', does: 'show' },
  { key: 'leads', label: 'Collect leads', does: 'leads' },
  { key: 'run', label: 'Run a small tool', does: 'run' },
];
const PREFS = [
  { key: 'cheap', label: 'Lowest price' },
  { key: 'fast', label: 'Ready fastest' },
  { key: 'rated', label: 'Best rated' },
];

type Goal = (typeof GOALS)[number];
type Pref = (typeof PREFS)[number];

function rank(all: Product[], biz: Biz, goal: Goal | null, pref: Pref | null) {
  const scored = all
    .filter((p) => biz.cats.length === 0 || biz.cats.includes(p.cat) || (goal && (p.does ?? []).includes(goal.does)))
    .map((p) => {
      const why: string[] = [];
      let s = p.reviews > 0 ? p.rating : 4.3; // a fair base for everyone
      if (biz.cats.includes(p.cat)) {
        s += 10;
        why.push(`Made for ${biz.label.toLowerCase()}`);
      }
      const does = goal ? (p.does ?? []).includes(goal.does) : false;
      if (goal && does) {
        s += 5;
        why.push(goal.label.toLowerCase());
      }
      if (pref?.key === 'cheap') {
        s += (60 - Math.min(60, p.price)) / 20;
        if (p.price < 30) why.push(SHOW_LIST_PRICES ? `only ${money(p.price)}` : 'lower price');
      }
      if (pref?.key === 'fast') {
        s += p.days === 1 ? 3 : 3 - p.days;
        if (p.days === 1) why.push('ready in 1 day');
      }
      if (pref?.key === 'rated') {
        s += (p.rating - 4) * 3;
        if (p.reviews > 0 && p.rating >= 4.8) why.push(`rated ${p.rating}`);
      }
      const fits = (biz.cats.length === 0 || biz.cats.includes(p.cat)) && (!goal || does);
      return { p, s, why, fits };
    });
  // Prefer sites that fit both answers; fall back to the category alone so there is always something to show.
  const both = scored.filter((x) => x.fits).sort((a, b) => b.s - a.s);
  const rows = (both.length ? both : [...scored].sort((a, b) => b.s - a.s)).slice(0, 3);
  return { rows, exact: both.length > 0 || !goal };
}

export function SolutionFinder({ extra = [], examples = [] }: { extra?: Product[]; examples?: Product[] }) {
  const all = useMemo(() => [...extra, ...examples], [extra, examples]);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [pref, setPref] = useState<Pref | null>(null);
  const out = useRef<HTMLDivElement>(null);
  const result = useMemo(() => (biz ? rank(all, biz, goal, pref) : null), [all, biz, goal, pref]);

  // On a phone the answers are below the fold, so bring them into view after the first choice.
  const first = useRef(true);
  useEffect(() => {
    if (!biz || !first.current) return;
    first.current = false;
    out.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [biz]);

  return (
    <div className="ff">
      <h2 className="ff-q">
        <span>1</span>What do you do?
      </h2>
      <div className="ff-biz" role="radiogroup" aria-label="What do you do?">
        {BIZ.map((b) => {
          const img = imageFor(b.photo);
          const on = biz?.key === b.key;
          return (
            <button
              key={b.key}
              type="button"
              role="radio"
              aria-checked={on}
              className="ff-b"
              onClick={() => {
                if (biz?.key !== b.key) {
                  setGoal(null);
                  setPref(null);
                }
                setBiz(b);
              }}
            >
              <span className="ff-th" style={{ background: THEMES[b.theme].b }}>
                {img ? <Image src={img.src} alt="" fill sizes="120px" style={{ objectFit: 'cover', objectPosition: 'top' }} /> : <i style={{ color: THEMES[b.theme].a }}>{b.label[0]}</i>}
              </span>
              <b>{b.label}</b>
            </button>
          );
        })}
      </div>

      <div ref={out} className="ff-out" aria-live="polite">
        {!biz && <p className="ff-hint">Pick one. The best sites appear right here, no more questions.</p>}

        {biz && result && (
          <>
            <div className="ff-tune">
              <p className="ff-q2">
                <span>2</span>Optional: make it more exact
              </p>
              <div className="ff-chips" role="group" aria-label="What should the site do?">
                <em>It should</em>
                {GOALS.map((g) => (
                  <button key={g.key} type="button" aria-pressed={goal?.key === g.key} onClick={() => setGoal(goal?.key === g.key ? null : g)}>
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="ff-chips" role="group" aria-label="What matters most?">
                <em>I care about</em>
                {PREFS.map((x) => (
                  <button key={x.key} type="button" aria-pressed={pref?.key === x.key} onClick={() => setPref(pref?.key === x.key ? null : x)}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>

            <h3 className="ff-res-h">{result.rows.length === 1 ? 'Your best match' : `Your ${result.rows.length} best matches`}</h3>
            {!result.exact && goal && <p className="muted ff-note">Nothing does exactly &ldquo;{goal.label.toLowerCase()}&rdquo; for this kind of business, so here are the closest.</p>}
            <ul className="ff-res">
              {result.rows.map(({ p, why }, i) => {
                const img = imageFor(p.id);
                return (
                  <li key={p.id}>
                    <Link href={`/product/${p.id}`} className="ff-card">
                      <span className="ff-shot">
                        {img ? <Image src={img.src} alt="" fill sizes="110px" style={{ objectFit: 'cover', objectPosition: 'top' }} /> : <i style={{ background: THEMES[p.theme].b }} />}
                      </span>
                      <span className="ff-info">
                        {i === 0 && (
                          <span className="chip mint">
                            <i />
                            Best match
                          </span>
                        )}
                        <b>{p.name}</b>
                        <span className="muted">
                          {why.length
                            ? why
                                .slice(0, 3)
                                .join(' · ')
                                .replace(/^./, (c) => c.toUpperCase())
                            : p.tag}
                        </span>
                        <small>
                          {SHOW_LIST_PRICES && <>{money(p.price)} · </>}
                          {daysLabel(p.days)}
                        </small>
                      </span>
                      <span className="ff-go" aria-hidden="true">
                        See it
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="ff-actions">
              <Link className="btn btn-line" href={biz.cats[0] ? `/browse?cat=${encodeURIComponent(biz.cats[0])}` : '/browse'}>
                See all {biz.cats[0] ?? 'sites'}
              </Link>
              {(goal || pref) && (
                <button
                  type="button"
                  className="ff-clear"
                  onClick={() => {
                    setGoal(null);
                    setPref(null);
                  }}
                >
                  Clear extra choices
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
