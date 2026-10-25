'use client';
import { useEffect } from 'react';
import { riseDelay, shouldRise } from '@/lib/motion';

/* Brings each [data-rise] group on the store home in as it scrolls into view, one item after another.
   Without JS, with reduced motion or without IntersectionObserver nothing is hidden, so the page is always readable. */
export function StoreMotion() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return;
    const groups = [...document.querySelectorAll<HTMLElement>('[data-rise]')].filter((g) => shouldRise(g.getBoundingClientRect().top, innerHeight, reduced));
    if (!groups.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const g of groups) {
      [...g.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--rise-d', riseDelay(i) + 'ms'));
      g.classList.add('rise');
      io.observe(g);
    }
    return () => {
      io.disconnect();
      for (const g of groups) g.classList.add('in'); // never leave a group hidden
    };
  }, []);
  return null;
}
