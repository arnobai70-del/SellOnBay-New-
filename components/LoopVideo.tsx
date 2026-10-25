'use client';
import { useEffect, useRef } from 'react';

/* A silent looping video that only plays while it is on screen, and stays a still picture for people who prefer less motion. */
export function LoopVideo({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting)
          v.play().catch(() => {
            /* autoplay blocked: the poster stays visible */
          });
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return <video ref={ref} className={className} src={src} poster={poster} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} disablePictureInPicture />;
}
