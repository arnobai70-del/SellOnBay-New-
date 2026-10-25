'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { PRODUCTS, imageFor, money } from '@/lib/data';

/*
 * The listings as a turning 3D ring. It drifts by itself, you can drag it (with a little momentum), use the arrow buttons or
 * the arrow keys, and any card opens its site. Reduced motion: no drifting, buttons and keys still turn it.
 */
export function Ring3D() {
  const items = PRODUCTS.map((p) => ({ p, img: imageFor(p.id) })).filter((x) => x.img);
  const n = items.length;
  const ring = useRef<HTMLDivElement>(null);
  const state = useRef({ angle: 0, vel: 0, goal: 0, drag: false, moved: 0, lastX: 0, hover: false, still: false });
  const step = 360 / n;

  useEffect(() => {
    const el = ring.current;
    if (!el || !n) return;
    const s = state.current;
    s.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0,
      visible = true,
      last = performance.now();
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(el);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Motion is scaled by real elapsed time, so a slow phone and a fast desktop turn the ring at the same speed.
      const k = Math.min(3, (now - last) / 16.667);
      last = now;
      if (!visible || document.hidden) return;
      if (s.goal) {
        const d = s.goal * (1 - Math.pow(0.86, k));
        s.angle += d;
        s.goal -= d;
        if (Math.abs(s.goal) < 0.05) {
          s.angle += s.goal;
          s.goal = 0;
        }
      } // eased turn from the buttons and keys
      if (!s.drag) {
        s.angle += s.vel * k;
        s.vel *= Math.pow(0.95, k); // momentum fades out
        if (Math.abs(s.vel) < 0.02 && !s.hover && !s.still) s.angle += 0.09 * k; // slow drift when nobody is touching it
      }
      el.style.transform = `rotateY(${s.angle.toFixed(2)}deg)`;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [n]);

  const down = (e: React.PointerEvent) => {
    const s = state.current;
    s.drag = true;
    s.moved = 0;
    s.lastX = e.clientX;
    s.vel = 0;
    s.angle += s.goal;
    s.goal = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = state.current;
    if (!s.drag) return;
    const dx = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.moved += Math.abs(dx);
    s.angle += dx * 0.32;
    s.vel = dx * 0.32;
  };
  const up = () => {
    state.current.drag = false;
  };
  const turn = (dir: number) => {
    const s = state.current;
    s.vel = 0;
    s.goal += dir * step;
  }; // one click is exactly one card, with no leftover momentum

  return (
    <div
      className="r3"
      role="region"
      aria-label="Sites ready to launch, turning ring. Drag, or use the arrow buttons."
      onPointerEnter={() => {
        state.current.hover = true;
      }}
      onPointerLeave={() => {
        state.current.hover = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') turn(1);
        if (e.key === 'ArrowRight') turn(-1);
      }}
    >
      <div className="r3-view" style={{ '--n': n } as React.CSSProperties} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="r3-stage">
          <div className="r3-ring" ref={ring}>
            {items.map(({ p, img }, i) => (
              <Link
                key={p.id}
                href={`/product/${p.id}`}
                className="r3-card"
                style={{ transform: `rotateY(${i * step}deg) translateZ(var(--R))` }}
                onClickCapture={(e) => {
                  if (state.current.moved > 6) e.preventDefault();
                }}
                draggable={false}
              >
                <Image src={img!.src} alt={`${p.name} website`} fill sizes="220px" draggable={false} style={{ objectFit: 'cover', objectPosition: 'top' }} />
                <span className="r3-tag">
                  <b>{p.name}</b> {money(p.price)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="r3-ctl">
        <button type="button" aria-label="Turn the ring to the left" onClick={() => turn(1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span>Drag to turn</span>
        <button type="button" aria-label="Turn the ring to the right" onClick={() => turn(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
