'use client';
import { useEffect, useRef } from 'react';

/* The hero's background clip. Decorative: the server HTML has no source and no autoplay, so the poster (an optimised image) is what loads first.
   The source is set after the page has loaded, never with reduced motion, Save-Data or a 2g connection, and the clip pauses while the hero is off screen. */
const SRC = { wide: '/media/hero-1280.mp4', narrow: '/media/hero-854.mp4' };

export function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = true;
    const play = () =>
      v.play().catch(() => {
        /* autoplay refused: the poster stays */
      });
    const start = () => {
      timer = setTimeout(() => {
        v.src = innerWidth < 760 ? SRC.narrow : SRC.wide;
        v.addEventListener('playing', () => v.classList.add('on'), { once: true });
        if (visible) play();
      }, 200);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!v.src) return;
      if (visible) play();
      else v.pause();
    });
    io.observe(v.closest('section') ?? v);
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
    return () => {
      clearTimeout(timer);
      removeEventListener('load', start);
      io.disconnect();
      v.pause();
    };
  }, []);

  return <video ref={ref} className="vh-video" muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} disablePictureInPicture />;
}
