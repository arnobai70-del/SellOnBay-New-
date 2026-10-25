'use client';
import { useEffect, useRef, useState } from 'react';
import { TLDS, cleanName } from '@/lib/domains';

/* The home hero picture (owner, 2026-10-21): a small domain finder. The panel types an example business name, scans, and
   lists name ideas with a few endings; the box under it is a real form that opens /domains?q=<name>. The registrar is not
   connected, so the panel shows ideas, never "available". It runs only on screen in a visible tab, holds while the visitor
   uses the form, and shows one finished frame with reduced motion (or without JS). */
const NAMES = ['sunrisebakery', 'lumastudio', 'fitwithmaya', 'northcafe'];
const ENDINGS = TLDS.slice(0, 4).map(([t]) => t);
const TICK = 100;
const TYPE = 110; // ms a letter
const SCAN = 900;
const ROW = 260;
const HOLD = 2400;
const span = (name: string) => name.length * TYPE + SCAN + ENDINGS.length * ROW + HOLD;

export function HeroDomain() {
  const box = useRef<HTMLDivElement>(null);
  const [{ n, ms }, setAt] = useState({ n: 0, ms: Number.MAX_SAFE_INTEGER }); // a finished frame until the motion starts
  const [run, setRun] = useState(false);
  const [held, setHeld] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') return;
    const el = box.current;
    if (!el) return;
    let seen = false;
    const sync = () => setRun(seen && !document.hidden);
    const io = new IntersectionObserver(([e]) => ((seen = e.isIntersecting), sync()));
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    setAt({ n: 0, ms: 0 });
    return () => (io.disconnect(), document.removeEventListener('visibilitychange', sync));
  }, []);

  useEffect(() => {
    if (!run || held) return;
    const t = setInterval(() => setAt((a) => (a.ms + TICK < span(NAMES[a.n]) ? { n: a.n, ms: a.ms + TICK } : { n: (a.n + 1) % NAMES.length, ms: 0 })), TICK);
    return () => clearInterval(t);
  }, [run, held]);

  const name = NAMES[n];
  const typed = Math.min(name.length, Math.floor(ms / TYPE));
  const afterType = ms - name.length * TYPE;
  const scanning = afterType >= 0 && afterType < SCAN;
  const rows = afterType < SCAN ? 0 : Math.min(ENDINGS.length, Math.floor((afterType - SCAN) / ROW) + 1);
  const done = rows === ENDINGS.length;
  const clean = cleanName(q);

  return (
    <div className="mk-find" ref={box} onMouseEnter={() => setHeld(true)} onMouseLeave={() => setHeld(false)}>
      <div className="mk-find-panel" aria-hidden="true">
        <div className="mk-find-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="mk-find-typed">
            {name.slice(0, typed)}
            <i className="mk-find-caret" data-on={typed < name.length || scanning ? '1' : undefined} />
          </span>
        </div>
        <div className="mk-find-scan" data-on={scanning ? '1' : undefined}>
          <span />
        </div>
        <ul className="mk-find-list">
          {ENDINGS.map((t, k) => (
            <li key={t} data-in={k < rows ? '1' : undefined} data-pick={done && k === 0 ? '1' : undefined}>
              <span className="mk-find-dom">
                {name}
                <b>{t}</b>
              </span>
              <span className="mk-find-tag">{done && k === 0 ? 'Your pick' : 'Idea'}</span>
            </li>
          ))}
        </ul>
        <p className="mk-find-note">{scanning ? 'Finding names…' : 'Example names'}</p>
      </div>

      <form className="mk-find-form" action="/domains" method="get" onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
        <label htmlFor="mk-find-q">Find a domain for your site</label>
        <div className="mk-find-row">
          <input id="mk-find-q" name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Your business name" autoComplete="off" maxLength={63} />
          <button className="btn btn-gold" type="submit" disabled={q.length > 0 && clean.length < 2}>
            Find domain
          </button>
        </div>
      </form>
    </div>
  );
}
