'use client';
import { useEffect, useRef, useState } from 'react';

/* Previous / next for one category rail, and the soft edges that show there is more to either side. The rail itself is a plain scrollable list in
   the server HTML, so it works by swiping, the scroll bar or the keyboard without this. */
export function RailControls({ rail, label }: { rail: string; label: string }) {
  const [at, setAt] = useState({ start: true, end: false });
  const el = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const r = document.getElementById(rail);
    if (!r) return;
    el.current = r;
    const upd = () => {
      const start = r.scrollLeft < 4;
      const end = r.scrollLeft + r.clientWidth >= r.scrollWidth - 4;
      r.classList.toggle('fl', !start);
      r.classList.toggle('end', end);
      setAt({ start, end });
    };
    upd();
    r.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    return () => {
      r.removeEventListener('scroll', upd);
      removeEventListener('resize', upd);
    };
  }, [rail]);

  const move = (dir: number) => el.current?.scrollBy({ left: dir * el.current.clientWidth * 0.9, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  if (at.start && at.end) return null; // everything fits: no buttons
  return (
    <span className="hc-rail-ctl">
      <button type="button" aria-label={`Previous: ${label}`} aria-controls={rail} disabled={at.start} onClick={() => move(-1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <button type="button" aria-label={`Next: ${label}`} aria-controls={rail} disabled={at.end} onClick={() => move(1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </span>
  );
}
