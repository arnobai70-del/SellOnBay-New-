'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CATS, FEATURES as WEB_FEATURES, doesFeature, imageFor, isNew, type Product } from '@/lib/data';
import { APP_FEATURES, catsFor, shelfHref, shelfLabel, topicFor, type Platform } from '@/lib/apps';
import { demoLift } from '@/lib/demoQuality';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { flags } from '@/lib/flags';
import { useList } from '@/lib/saved';
import { CompareDialog } from './CompareDialog';
import { RecentlyViewed } from './RecentlyViewed';
import { TallCard } from './TallCard';

type Sort = 'best' | 'rating' | 'sold' | 'new' | 'low' | 'high' | 'az';
const SORTS: [Sort, string][] = [
  ['best', 'Best match'],
  ['rating', 'Top rated'],
  ['sold', 'Most sold'],
  ['new', 'Newest'],
  ['low', 'Price: low to high'],
  ['high', 'Price: high to low'],
  ['az', 'Name: A to Z'],
].filter(([k]) => SHOW_LIST_PRICES || (k !== 'low' && k !== 'high')) as [Sort, string][]; // no price order while lists hide prices
const DAYS: [string, string][] = [
  ['', 'Any time'],
  ['1', '1 day'],
  ['2', 'Up to 2 days'],
  ['3', 'Up to 3 days'],
  ['5', 'Up to 5 days'],
  ['7', 'Up to 7 days'],
];
const RATINGS: [string, string][] = [
  ['', 'Any rating'],
  ['4.5', '4.5 and up'],
  ['4.7', '4.7 and up'],
  ['4.8', '4.8 and up'],
];
const POPULAR_FOR: Record<Platform, string[]> = {
  web: ['restaurant', 'booking', 'shop', 'portfolio'],
  android: ['fitness', 'food', 'habit', 'notes'],
  ios: ['notes', 'travel', 'bills', 'fitness'],
  webapp: ['tasks', 'invoice', 'forms', 'team'],
  desktop: ['timer', 'clipboard', 'offline', 'ledger'],
  digital: ['figma', 'notion', 'n8n', 'chatbot'],
};
const COPY: Record<Platform, { noun: string; plural: string; title: string; lead: string; ph: string }> = {
  web: { noun: 'site', plural: 'sites', title: 'Ready-made websites', lead: 'Pick one, add your domain, and go live in 1 to 7 days.', ph: 'Search for a site' },
  android: {
    noun: 'app',
    plural: 'apps',
    title: 'Android apps, ready for Google Play',
    lead: 'Pick one. The seller rebrands it, builds it and puts it on your own Google Play account in 1 to 7 days.',
    ph: 'Search for an app',
  },
  ios: {
    noun: 'app',
    plural: 'apps',
    title: 'iPhone & iPad apps, ready for the App Store',
    lead: 'Pick one. The seller rebrands it, builds it and sends it to your own App Store account in 1 to 7 days. Apple reviews it after that.',
    ph: 'Search for an app',
  },
  webapp: {
    noun: 'app',
    plural: 'apps',
    title: 'Web apps, deployed on your domain',
    lead: 'Pick one. The seller rebrands it and puts it live on your own domain in 1 to 7 days.',
    ph: 'Search for a web app',
  },
  desktop: {
    noun: 'app',
    plural: 'apps',
    title: 'Desktop apps for Windows, Mac and Linux',
    lead: 'Pick one. The seller rebrands it and sends you installers in 1 to 7 days. No store needed.',
    ph: 'Search for a desktop app',
  },
  digital: {
    noun: 'product',
    plural: 'products',
    title: 'Digital products, ready to use',
    lead: 'Figma kits, templates, plugins, scripts, automations, chatbots, AI prompts and video templates. You get the files as soon as you pay, then 48 hours to check them while your money is held.',
    ph: 'Search for a product',
  },
};
const PAGE = 12;
const MAX_COMPARE = 3;

export type Initial = { cat?: string; q?: string; feat?: string; min?: string; max?: string; days?: string; rating?: string; sort?: string; saved?: string; domain?: string; topic?: string };

/* A price from the address bar or a text box: digits only, anything else counts as empty. */
const num = (v?: string) => (v && /^\d{1,4}$/.test(v) ? v : '');

/* Unrated listings get a fair middle score, and a small lift while new, so a seller's first listing is not buried below sites with reviews. */
const fair = (p: Product) => (p.reviews > 0 ? p.rating : 4.3) + (isNew(p) ? 0.3 : 0) + (flags.demoRanking ? demoLift(p) : 0);

/* How well a site matches the words typed: name beats tag, tag beats description. All words must match. */
function score(p: Product, q: string) {
  if (!q) return 0;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) {
    let ws = 0;
    if (p.name.toLowerCase().includes(w)) ws += 6;
    if ((p.tag + ' ' + p.cat).toLowerCase().includes(w)) ws += 3;
    if (p.desc.toLowerCase().includes(w) || p.inc.join(' ').toLowerCase().includes(w)) ws += 1;
    if (!ws) return 0; // every word must be found somewhere, or the site is not a match
    s += ws;
  }
  return s;
}

export function BrowseClient({ initial, items, kind = 'web' }: { initial: Initial; items: Product[]; kind?: Platform }) {
  const PRODUCTS = items;
  const POPULAR = POPULAR_FOR[kind];
  const copy = COPY[kind];
  const FEATURES = kind === 'web' ? WEB_FEATURES : APP_FEATURES.filter((f) => items.some((p) => doesFeature(p, f.key))); // only options that exist on this shelf
  // A topic (AI tools, Audio, Fonts...) narrows the digital shelf to its few kinds; each of them shows even before it has a product.
  const [topic, setTopic] = useState(kind === 'digital' ? topicFor(initial.topic) : undefined);
  const CATLIST = useMemo(
    () => (kind === 'web' ? CATS : ['All', ...(topic ? topic.cats : catsFor(kind).filter((c) => c === initial.cat || items.some((p) => p.cat === c)))]),
    [kind, items, topic, initial.cat],
  );
  const inScope = useMemo(() => (topic ? PRODUCTS.filter((p) => topic.cats.includes(p.cat)) : PRODUCTS), [PRODUCTS, topic]);
  const hi = useMemo(() => Math.max(10, Math.ceil(Math.max(...PRODUCTS.map((p) => p.price)) / 10) * 10), [PRODUCTS]);

  const [cat, setCat] = useState(CATLIST.includes(initial.cat ?? '') ? initial.cat! : 'All');
  const [q, setQ] = useState(initial.q ?? '');
  const [feature, setFeature] = useState<string | null>(FEATURES.some((f) => f.key === initial.feat) ? initial.feat! : null);
  const [min, setMin] = useState(SHOW_LIST_PRICES ? num(initial.min) : '');
  const [max, setMax] = useState(SHOW_LIST_PRICES ? num(initial.max) : '');
  const [days, setDays] = useState(DAYS.some(([k]) => k === initial.days) ? initial.days! : '');
  const [rating, setRating] = useState(RATINGS.some(([k]) => k === initial.rating) ? initial.rating! : '');
  const [sort, setSort] = useState<Sort>(SORTS.some(([k]) => k === initial.sort) ? (initial.sort as Sort) : 'best');
  const [onlySaved, setOnlySaved] = useState(initial.saved === '1');
  const [shown, setShown] = useState(PAGE);
  const [drawer, setDrawer] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const saved = useList('saved');

  const lo = num(min) === '' ? 0 : +min,
    top = num(max) === '' ? Infinity : +max;
  const countIn = (c: string) => (c === 'All' ? inScope.length : inScope.filter((p) => p.cat === c).length);

  // Keep the address in step with the filters, so a filtered view can be shared, bookmarked and reached with the Back button.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (topic) sp.set('topic', topic.key);
    if (cat !== 'All') sp.set('cat', cat);
    if (q) sp.set('q', q);
    if (feature) sp.set('feat', feature);
    if (min) sp.set('min', min);
    if (max) sp.set('max', max);
    if (days) sp.set('days', days);
    if (rating) sp.set('rating', rating);
    if (sort !== 'best') sp.set('sort', sort);
    if (onlySaved) sp.set('saved', '1');
    if (initial.domain) sp.set('domain', initial.domain);
    const qs = sp.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }, [topic, cat, q, feature, min, max, days, rating, sort, onlySaved, initial.domain]);

  useEffect(() => {
    setShown(PAGE);
  }, [topic, cat, q, feature, min, max, days, rating, sort, onlySaved]);
  useEffect(() => {
    if (!drawer) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [drawer]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inScope
      .filter(
        (p) =>
          (cat === 'All' || p.cat === cat) &&
          p.price >= lo &&
          p.price <= top &&
          (!feature || doesFeature(p, feature)) &&
          (!days || p.days <= +days) &&
          (!rating || (p.reviews > 0 && p.rating >= +rating)) &&
          (!onlySaved || saved.includes(p.id)) &&
          (!needle || score(p, needle) > 0),
      )
      .sort((a, b) => {
        switch (sort) {
          case 'low':
            return a.price - b.price;
          case 'high':
            return b.price - a.price;
          case 'sold':
            return b.sold - a.sold;
          case 'new':
            return b.added.localeCompare(a.added);
          case 'az':
            return a.name.localeCompare(b.name);
          case 'best':
            return needle ? score(b, needle) * 10 + fair(b) - (score(a, needle) * 10 + fair(a)) : fair(b) - fair(a);
          default:
            return b.rating - a.rating;
        }
      });
  }, [inScope, cat, q, sort, lo, top, feature, days, rating, onlySaved, saved]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  const leaveTopic = () => {
    setTopic(undefined);
    setCat('All');
  };
  if (topic) chips.push({ key: 'topic', label: topic.label, clear: leaveTopic });
  if (cat !== 'All') chips.push({ key: 'cat', label: cat, clear: () => setCat('All') });
  if (q) chips.push({ key: 'q', label: `"${q}"`, clear: () => setQ('') });
  if (feature) chips.push({ key: 'feat', label: FEATURES.find((f) => f.key === feature)!.label, clear: () => setFeature(null) });
  if (min || max)
    chips.push({
      key: 'price',
      label: `$${min || 0} to ${max ? '$' + max : 'any'}`,
      clear: () => {
        setMin('');
        setMax('');
      },
    });
  if (days) chips.push({ key: 'days', label: DAYS.find(([k]) => k === days)![1], clear: () => setDays('') });
  if (rating) chips.push({ key: 'rating', label: `Rated ${rating}+`, clear: () => setRating('') });
  if (onlySaved) chips.push({ key: 'saved', label: 'Saved only', clear: () => setOnlySaved(false) });
  const reset = () => {
    setTopic(undefined);
    setCat('All');
    setQ('');
    setFeature(null);
    setMin('');
    setMax('');
    setDays('');
    setRating('');
    setOnlySaved(false);
  };

  // A topic or kind with no products yet: say so plainly and invite sellers, instead of "no match".
  const fresh = kind === 'digital' && (!!topic || cat !== 'All') && countIn(cat) === 0;
  const toggleCmp = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < MAX_COMPARE ? [...s, id] : s));
  const pickedItems = picked.map((id) => PRODUCTS.find((p) => p.id === id)).filter((p): p is Product => !!p);
  const visible = list.slice(0, shown);

  const side = (
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
        <legend>Category</legend>
        {CATLIST.map((c) => (
          <label key={c} className="opt-row">
            <input type="radio" name="cat" checked={cat === c} onChange={() => setCat(c)} />
            <span>{c}</span>
            <em>{countIn(c)}</em>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>What it does</legend>
        <label className="opt-row">
          <input type="radio" name="feat" checked={feature === null} onChange={() => setFeature(null)} />
          <span>Anything</span>
        </label>
        {FEATURES.map((f) => (
          <label key={f.key} className="opt-row">
            <input type="radio" name="feat" checked={feature === f.key} onChange={() => setFeature(f.key)} />
            <span>{f.label}</span>
            <em>{PRODUCTS.filter((p) => doesFeature(p, f.key)).length}</em>
          </label>
        ))}
      </fieldset>
      {SHOW_LIST_PRICES && (
        <fieldset>
          <legend>Price</legend>
          <div className="price-in">
            <label>
              <span className="sr">Lowest price</span>
              <i>$</i>
              <input type="number" inputMode="numeric" min={0} max={hi} placeholder="0" value={min} onChange={(e) => setMin(e.target.value)} />
            </label>
            <span aria-hidden="true">to</span>
            <label>
              <span className="sr">Highest price</span>
              <i>$</i>
              <input type="number" inputMode="numeric" min={0} max={hi} placeholder={String(hi)} value={max} onChange={(e) => setMax(e.target.value)} />
            </label>
          </div>
          <div className="quick">
            {[
              ['Under $25', '', '24'],
              ['$25 to $50', '25', '50'],
              ['Over $50', '51', ''],
            ].map(([l, a, b]) => (
              <button
                key={l}
                type="button"
                aria-pressed={min === a && max === b}
                onClick={() => {
                  setMin(a);
                  setMax(b);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>Ready in</legend>
        {DAYS.map(([k, l]) => (
          <label key={k} className="opt-row">
            <input type="radio" name="days" checked={days === k} onChange={() => setDays(k)} />
            <span>{l}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Rating</legend>
        {RATINGS.map(([k, l]) => (
          <label key={k} className="opt-row">
            <input type="radio" name="rating" checked={rating === k} onChange={() => setRating(k)} />
            <span>
              {k && <b className="star">★ </b>}
              {l}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Your list</legend>
        <label className="opt-row">
          <input type="checkbox" checked={onlySaved} onChange={(e) => setOnlySaved(e.target.checked)} />
          <span>Saved {copy.plural} only</span>
          <em>{saved.length}</em>
        </label>
      </fieldset>
      <div className="bl-side-foot">
        <button type="button" className="btn btn-line btn-sm" onClick={reset} disabled={!chips.length}>
          Clear all
        </button>
        <button type="button" className="btn btn-blue btn-sm" onClick={() => setDrawer(false)}>
          Show {list.length} {list.length === 1 ? copy.noun : copy.plural}
        </button>
      </div>
    </aside>
  );

  return (
    <div data-browse>
      <section className="mk-shelfhead" data-kind={kind}>
        <div className="wrap">
          <nav className="mk-crumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/categories">Categories</Link>
            <span aria-hidden="true">/</span>
            {topic ? (
              <>
                <Link href={shelfHref(kind)} onClick={leaveTopic}>
                  {shelfLabel(kind)}
                </Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{topic.label}</span>
              </>
            ) : (
              <span aria-current="page">{shelfLabel(kind)}</span>
            )}
          </nav>
          <div className="mk-shelfhead-row">
            <div className="mk-shelfhead-copy">
              <h1>{topic ? topic.label : copy.title}</h1>
              <p className="lead">{topic ? topic.lead : copy.lead}</p>
            </div>
            <label className="search bsearch mk-shelfsearch">
              <span className="sr">Search {copy.plural}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5E6485" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.ph} autoComplete="off" />
              {q && (
                <button type="button" className="clr" aria-label="Clear search" onClick={() => setQ('')}>
                  Clear
                </button>
              )}
            </label>
          </div>
          <div className="mk-catchips" role="group" aria-label="Categories">
            {CATLIST.map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c === 'All' ? (topic ? `All in ${topic.label}` : `All ${copy.plural}`) : c}
                <em>{countIn(c)}</em>
              </button>
            ))}
          </div>
          <p className="mk-popular">
            Popular:{' '}
            {POPULAR.map((w, i) => (
              <span key={w}>
                <button type="button" onClick={() => setQ(w)}>
                  {w}
                </button>
                {i < POPULAR.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </div>
      </section>

      <div className="wrap">
        {initial.domain && (
          <div className="note" style={{ margin: '22px 0 0' }}>
            <span>
              Pick a site for <b>{initial.domain}</b>. You&apos;ll add the domain at checkout.
            </span>
          </div>
        )}
        <RecentlyViewed kind={kind} />

        <div className="bl">
          {side}
          {drawer && <button type="button" className="bl-scrim" aria-label="Close filters" onClick={() => setDrawer(false)} />}

          <div className="bl-main">
            <div className="bl-bar">
              <p className="muted" aria-live="polite">
                <b>{list.length}</b> {list.length === 1 ? copy.noun : copy.plural}
                {list.length !== inScope.length && <> of {inScope.length}</>}
              </p>
              <div className="bl-bar-r">
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

            <div className="grid tall-grid bl-grid">
              {visible.length ? (
                visible.map((p) => <TallCard key={p.id} p={p} compare={{ on: picked.includes(p.id), full: picked.length >= MAX_COMPARE, toggle: () => toggleCmp(p.id) }} />)
              ) : (
                <div className="empty bl-empty" style={{ gridColumn: '1/-1' }}>
                  {fresh ? (
                    <>
                      <b>Nothing in {cat === 'All' ? topic!.label : cat} yet</b>
                      <p>This part of the store is new. Sellers can list here now, and every order is held in escrow like the rest.</p>
                      <div className="bl-empty-btns">
                        <Link className="btn btn-blue btn-sm" href="/sell">
                          Sell yours here
                        </Link>
                        <button type="button" className="btn btn-line btn-sm" onClick={reset}>
                          See all {copy.plural}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <b>{onlySaved && !saved.length ? 'Nothing saved yet' : `No ${copy.plural} match these filters`}</b>
                      <p>{onlySaved && !saved.length ? 'Tap the heart on a site to keep it here.' : 'Try fewer filters or a different word.'}</p>
                      <div className="bl-empty-btns">
                        {chips.length > 0 && (
                          <button type="button" className="btn btn-blue btn-sm" onClick={reset}>
                            Clear all filters
                          </button>
                        )}
                        {POPULAR.slice(0, 3).map((w) => (
                          <button
                            key={w}
                            type="button"
                            className="btn btn-line btn-sm"
                            onClick={() => {
                              reset();
                              setQ(w);
                            }}
                          >
                            Try &ldquo;{w}&rdquo;
                          </button>
                        ))}
                      </div>
                    </>
                  )}
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

      {picked.length > 0 && (
        <div className="cmp-bar" role="region" aria-label="Compare tray">
          <div className="cmp-items">
            {pickedItems.map((p) => {
              const img = imageFor(p.id);
              return (
                <span key={p.id} className="cmp-item">
                  <span className="cmp-th">{img && <Image src={img.src} alt="" fill sizes="40px" style={{ objectFit: 'cover', objectPosition: 'top' }} />}</span>
                  <b>{p.name}</b>
                  <button type="button" aria-label={`Remove ${p.name} from comparison`} onClick={() => toggleCmp(p.id)}>
                    ×
                  </button>
                </span>
              );
            })}
            {picked.length < MAX_COMPARE && <span className="cmp-hint">Add {MAX_COMPARE - picked.length} more or compare now</span>}
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={() => setPicked([])}>
            Clear
          </button>
          <button type="button" className="btn btn-gold btn-sm" disabled={picked.length < 2} onClick={() => setCmpOpen(true)}>
            {picked.length < 2 ? 'Pick one more' : `Compare ${picked.length}`}
          </button>
        </div>
      )}
      <CompareDialog items={pickedItems} open={cmpOpen && pickedItems.length >= 2} onClose={() => setCmpOpen(false)} />
    </div>
  );
}
