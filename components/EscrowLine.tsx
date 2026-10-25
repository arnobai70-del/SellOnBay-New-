'use client';
import { useEffect, useRef, useState } from 'react';
import { CONFIG, PAYOUT_HOLD_DAYS, REVIEW_HOURS } from '@/lib/config';

const STEPS = [
  { t: 'You pay', d: 'Held by SellOnBay' },
  { t: 'Seller builds', d: `Within ${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays} days` },
  { t: 'You review', d: `${REVIEW_HOURS} hours to check` },
  { t: 'You accept', d: 'Final once accepted' },
  { t: 'Seller is paid', d: `${PAYOUT_HOLD_DAYS} days later` },
];

/* The line draws itself and each step lights up as the section scrolls into view. */
export function EscrowLine() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className={'esc' + (on ? ' on' : '')} ref={ref}>
      <div className="esc-line" aria-hidden="true">
        <i />
      </div>
      <ol>
        {STEPS.map((s, n) => (
          <li key={s.t} style={{ transitionDelay: n * 0.35 + 's' }}>
            <span className="esc-dot" />
            <b>{s.t}</b>
            <small>{s.d}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
