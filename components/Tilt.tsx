'use client';
import { useRef } from 'react';

/* Leans a card toward the pointer and slides a soft light across it. Only for real mice; touch and reduced motion get a plain card. */
export function Tilt({ children, max = 9, className = '' }: { children: React.ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useRef<boolean | null>(null);
  const enabled = () => (on.current ??= matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches);

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !enabled()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--tx', ((x - 0.5) * 2 * max).toFixed(2) + 'deg');
    el.style.setProperty('--ty', ((0.5 - y) * 2 * max).toFixed(2) + 'deg');
    el.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
    el.dataset.on = '1';
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tx', '0deg');
    el.style.setProperty('--ty', '0deg');
    delete el.dataset.on;
  };

  return (
    <div ref={ref} className={'tilt ' + className} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </div>
  );
}
