'use client';
import { useEffect, useRef, useState } from 'react';

/* Shows a page laid out at `base` px wide, shrunk to fit whatever width it is given. Height follows, so the parent can scroll or clip it. */
export function ScaledPage({ base = 1280, children }: { base?: number; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0.5);
  const [h, setH] = useState(0);

  useEffect(() => {
    const w = wrap.current,
      i = inner.current;
    if (!w || !i) return;
    const fit = () => {
      const sc = w.clientWidth / base;
      setS(sc);
      setH(i.offsetHeight * sc);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    ro.observe(i);
    return () => ro.disconnect();
  }, [base]);

  return (
    <div ref={wrap} className="sp">
      <div className="sp-box" style={{ height: h || undefined }}>
        <div ref={inner} className="sp-in" style={{ width: base, transform: `scale(${s})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
