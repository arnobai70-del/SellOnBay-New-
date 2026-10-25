'use client';
import { useEffect, useRef, useState } from 'react';

/* Counts up to a number the first time it scrolls into view. Shows the final number straight away without JS or with reduced motion. */
export function CountUp({ to, suffix = '', ms = 1100 }: { to: number; suffix?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setN(0);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / ms);
          setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, ms]);

  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}
