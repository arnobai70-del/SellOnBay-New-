'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Chapter = { title: string; points: [string, string][]; links: [string, string][]; visual: React.ReactNode };

/* Scroll story. Text chapters scroll on the left; the picture on the right stays put and swaps for each chapter and drifts with the scroll.
   The line on the far left fills as you read. With reduced motion everything is still, and on phones each picture sits under its chapter. */
export function StoryScroll({ chapters }: { chapters: Chapter[] }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [p, setP] = useState(0);

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = innerHeight,
        s = root.current?.getBoundingClientRect();
      if (!s) return;
      setP(Math.min(1, Math.max(0, (vh * 0.55 - s.top) / s.height)));
      let best = 0,
        bd = 1e9,
        off = 0;
      refs.current.forEach((c, i) => {
        if (!c) return;
        const r = c.getBoundingClientRect(),
          d = Math.abs(r.top + r.height / 2 - vh * 0.5);
        if (d < bd) {
          bd = d;
          best = i;
          off = (r.top + r.height / 2 - vh * 0.5) / vh;
        }
      });
      setActive(best);
      if (!still) stage.current?.style.setProperty('--sp', String(Math.max(-1, Math.min(1, off)).toFixed(3)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', on);
      removeEventListener('resize', on);
    };
  }, []);

  return (
    <section ref={root} className="st" aria-label="How SellOnBay works">
      <div className="wrap st-in">
        <div className="st-rail" aria-hidden="true">
          <i className="st-fill" style={{ height: p * 100 + '%' }} />
          <span className="st-node" style={{ top: p * 100 + '%' }}>
            <svg viewBox="0 0 32 32">
              <rect width="32" height="32" rx="9" fill="#2B3DFF" />
              <path d="M9 11h14M9 11v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="21.5" cy="7.5" r="3.4" fill="#FFB52E" />
            </svg>
          </span>
        </div>
        <div className="st-copy">
          {chapters.map((c, i) => (
            <article
              key={c.title}
              ref={(n) => {
                refs.current[i] = n;
              }}
              className={'st-ch' + (i === active ? ' on' : '')}
              data-ch={i}
            >
              <h2>{c.title}</h2>
              <ul className="st-pts">
                {c.points.map(([t, d]) => (
                  <li key={t}>
                    <b>{t}</b>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
              <div className="st-links">
                {c.links.map(([l, h], j) => (
                  <Link key={l} href={h} className={j === 0 ? 'st-main' : ''}>
                    {l}
                  </Link>
                ))}
              </div>
              <div className="st-vis-m">{c.visual}</div>
            </article>
          ))}
        </div>
        <div className="st-stage" ref={stage} aria-hidden="true">
          {chapters.map((c, i) => (
            <div key={c.title} className={'st-vis' + (i === active ? ' on' : '')}>
              {c.visual}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
