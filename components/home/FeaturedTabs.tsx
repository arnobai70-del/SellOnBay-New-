'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* The Popular / New / Top rated tabs. They stay links to /?tab=…, exactly as before (the server sorts the real products and each change counts as a
   page view); this only adds the sliding underline and lets the new cards come in with the same move as the rest of the page. */
export function FeaturedTabs({ tab, tabs, children }: { tab: string; tabs: (readonly [key: string, label: string, href: string])[]; children: React.ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const first = useRef(tab);
  const [swap, setSwap] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const on = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (on) setBar({ x: on.offsetLeft, w: on.offsetWidth });
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [tab]);

  // After the first tab, a change of tab plays the card entrance again.
  useEffect(() => {
    if (tab !== first.current) setSwap(true);
  }, [tab]);

  return (
    <>
      <div ref={list} className="ex-tabs hc-tabs" role="tablist" aria-label="Order">
        {tabs.map(([k, label, href]) => (
          <Link key={k} href={href} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : undefined} scroll={false}>
            {label}
          </Link>
        ))}
        {bar && <span className="hc-tab-bar" aria-hidden="true" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} />}
      </div>
      <div key={tab} className={'ex-grid hc-grid stg' + (swap ? ' swap' : '')}>
        {children}
      </div>
    </>
  );
}
