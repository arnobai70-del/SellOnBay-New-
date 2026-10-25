'use client';
import { useEffect, useRef } from 'react';

/* Fades a section in as it scrolls into view. Content already on screen is left alone, and it is plain visible without JS. */
export function Reveal({ children, className = '', ...rest }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || el.getBoundingClientRect().top < innerHeight) return;
    el.classList.add('reveal');
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('in');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className={className} {...rest}>
      {children}
    </section>
  );
}
