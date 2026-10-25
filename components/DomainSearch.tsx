'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cleanName, type DomainResult } from '@/lib/domains';

type Answer = { name: string; live: boolean; results: DomainResult[] };
const EXAMPLES = ['mariasbakery', 'northside-dental', 'folio-studio', 'greenleaf'];
const TABS = ['All', 'Popular', 'Business', 'Tech', 'Shop'] as const;

export function DomainSearch({ initial, registrarConnected, heading = 'Find a domain people remember', intro }: { initial: string; registrarConnected: boolean; heading?: string; intro?: string }) {
  const [q, setQ] = useState(initial);
  const [ans, setAns] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]>('All');
  const [cheap, setCheap] = useState(false);
  const [ph, setPh] = useState('');
  const [focus, setFocus] = useState(false);
  const seq = useRef(0);

  // The empty box types example names, like the one on the home page.
  useEffect(() => {
    if (focus || q || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPh('Type the name of your business');
      return;
    }
    let i = 0,
      n = 0,
      dir = 1,
      wait = 0;
    const t = setInterval(() => {
      if (wait > 0) {
        wait--;
        return;
      }
      n += dir;
      setPh(EXAMPLES[i].slice(0, n) || ' ');
      if (n >= EXAMPLES[i].length) {
        dir = -1;
        wait = 14;
      } else if (n <= 0) {
        dir = 1;
        i = (i + 1) % EXAMPLES.length;
        wait = 4;
      }
    }, 75);
    return () => clearInterval(t);
  }, [focus, q]);

  async function run(raw: string) {
    const name = cleanName(raw);
    setErr('');
    if (name.length < 2) {
      setAns(null);
      return setErr('Type at least 2 letters or numbers.');
    }
    const mine = ++seq.current;
    setBusy(true);
    try {
      const res = await fetch('/api/domains?name=' + encodeURIComponent(name));
      const body = await res.json();
      if (mine !== seq.current) return; // a newer search is already running
      if (!res.ok) {
        setAns(null);
        setErr(body.error ?? 'Search failed. Try again.');
      } else {
        setAns(body);
        setQ(name);
        history.replaceState(null, '', '/domains?q=' + encodeURIComponent(name));
      }
    } catch {
      if (mine === seq.current) {
        setAns(null);
        setErr('Could not reach the search. Check your connection and try again.');
      }
    }
    if (mine === seq.current) setBusy(false);
  }
  useEffect(() => {
    if (initial) run(initial);
    // Search once for the name in the address when the page opens, not again on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = ans?.results ?? [];
  const avail = all.filter((r) => r.available);
  const best = avail.find((r) => r.tld === '.com') ?? avail[0];
  const shown = all.filter((r) => r !== best && (tab === 'All' || r.kinds.includes(tab))).sort((a, b) => (cheap ? a.price - b.price : 0) || Number(b.available) - Number(a.available));
  const ideas = ans ? [`get${ans.name}`, `${ans.name}hq`, `${ans.name}-online`, `try${ans.name}`].filter((s) => s.length <= 40) : [];

  const row = (r: DomainResult, star = false) => (
    <li key={r.domain} className={'dm-row' + (r.available ? '' : ' gone') + (star ? ' best' : '')}>
      <div className="dm-name">
        <b>
          {r.domain.slice(0, -r.tld.length)}
          <span>{r.tld}</span>
        </b>
        {star && <em>Best pick</em>}
      </div>
      <span className={'dm-state ' + (r.available ? 'ok' : 'no')}>{ans?.live ? (r.available ? 'Available' : 'Taken') : 'Example only'}</span>
      <span className="dm-price">
        {r.available ? (
          <>
            <b>${r.price}</b>/year
          </>
        ) : (
          <small>Not for sale</small>
        )}
      </span>
      {r.available && ans?.live ? (
        <Link className={'btn btn-sm ' + (star ? 'btn-gold' : 'btn-line')} href={`/browse?domain=${encodeURIComponent(r.domain)}`} aria-label={`Choose ${r.domain}`}>
          Choose
        </Link>
      ) : (
        <span className="dm-na" aria-label={ans?.live ? 'Unavailable' : 'Not for sale'}>
          —
        </span>
      )}
    </li>
  );

  return (
    <section className="dm-hero">
      <div className="wrap">
        <h1>{heading}</h1>
        <p className="lead">
          {intro || (registrarConnected ? 'Check a domain name before choosing your website.' : 'Explore example names. Live availability checks and new domain registration are not connected yet.')}
        </p>
        <form
          className="dm-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(q);
          }}
          role="search"
        >
          <label className="sr" htmlFor="dm-q">
            Domain name
          </label>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5E6485" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            id="dm-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder={ph}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={60}
            aria-invalid={!!err}
            aria-describedby={err ? 'dm-err' : undefined}
          />
          <button className="btn btn-gold btn-lg" type="submit" disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>
        {err && (
          <p className="dm-err" id="dm-err" role="alert">
            {err}
          </p>
        )}
        {!ans && !err && (
          <p className="dm-try">
            Try{' '}
            <span>
              {EXAMPLES.map((x, i) => (
                <span key={x}>
                  <button
                    type="button"
                    onClick={() => {
                      setQ(x);
                      run(x);
                    }}
                  >
                    {x}
                  </button>
                  {i < EXAMPLES.length - 1 ? ', ' : ''}
                </span>
              ))}
            </span>
          </p>
        )}

        {ans && (
          <div className="dm-res" aria-live="polite">
            <p className="dm-count">
              <b>{avail.length}</b> of {all.length} {ans.live ? 'endings are currently shown as available' : 'simulated example results'} for <b>{ans.name}</b>
            </p>
            <div className="dm-bar">
              <div className="dm-tabs" role="group" aria-label="Kind of ending">
                {TABS.map((t) => (
                  <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <label className="dm-sort">
                <input type="checkbox" checked={cheap} onChange={(e) => setCheap(e.target.checked)} />
                <span>Cheapest first</span>
              </label>
            </div>
            <ul className="dm-list">
              {best && (tab === 'All' || best.kinds.includes(tab)) && row(best, true)}
              {shown.map((r) => row(r))}
              {!shown.length && !(best && (tab === 'All' || best.kinds.includes(tab))) && <li className="dm-empty">Nothing in this group. Try All.</li>}
            </ul>
            {!avail.length && (
              <div className="dm-none">
                <b>{ans.live ? 'All checked endings were unavailable.' : 'No sample results matched.'}</b>
                <p>Try one of these instead.</p>
              </div>
            )}
            <div className="dm-ideas">
              <span>More ideas</span>
              {ideas.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQ(s);
                    run(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="dm-note">
              {ans.live
                ? 'Domain availability can change until a registrar confirms registration. Confirm current prices and renewal terms before paying.'
                : 'Example data only: names, availability and prices are simulated, not checked with a registrar. No domain can be purchased or registered from these results.'}
            </p>
            <p className="dm-own">
              Already have a domain? <Link href="/browse">Pick a site and enter your own domain</Link>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
