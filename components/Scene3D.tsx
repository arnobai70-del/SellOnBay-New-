'use client';
import { useEffect, useRef } from 'react';

/*
 * A stage with real depth. Children marked with className "s3-l" and style {--z, --d} sit at different distances:
 * the whole stage turns toward the pointer, and nearer layers slide more than far ones (parallax).
 * Without a mouse, or with reduced motion, the stage stays still (the layers still float gently via CSS).
 */
export function Scene3D({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(pointer: fine)').matches) return;
    let nx = 0,
      ny = 0,
      cx = 0,
      cy = 0,
      raf = 0,
      visible = true;
    const move = (e: PointerEvent) => {
      nx = Math.max(-1, Math.min(1, (e.clientX / innerWidth - 0.5) * 2));
      ny = Math.max(-1, Math.min(1, (e.clientY / innerHeight - 0.5) * 2));
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(el);
    addEventListener('pointermove', move, { passive: true });
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      cx += (nx - cx) * 0.07;
      cy += (ny - cy) * 0.07;
      el.style.setProperty('--ry', (cx * 13).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-cy * 9).toFixed(2) + 'deg');
      el.style.setProperty('--px', cx.toFixed(3));
      el.style.setProperty('--py', cy.toFixed(3));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener('pointermove', move);
    };
  }, []);

  return (
    <div className={'s3 ' + className}>
      <div className="s3-in" ref={stage}>
        {children}
      </div>
    </div>
  );
}
