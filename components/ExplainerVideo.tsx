'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { imageFor, money } from '@/lib/data';
import { REVIEW_HOURS } from '@/lib/config';

/* A 25-second explainer that plays like a video (play, pause, jump between chapters) but is built from live markup,
   so it stays sharp on every screen, costs no bandwidth and never needs re-exporting when copy changes. */
const SCENE = 5000;
const CHAPTERS = [
  { tone: 'cobalt', t: 'Pick a site', d: 'Open the live demo and choose the one that fits.' },
  { tone: 'violet', t: 'Add your domain', d: 'Paste the one you own, or buy it in one click.' },
  { tone: 'gold', t: 'Your seller sets it up', d: 'Live on your domain in 1 to 7 days.' },
  { tone: 'mint', t: 'Review and accept', d: `You have ${REVIEW_HOURS} hours. Your money waits until you accept.` },
  { tone: 'rose', t: 'Seller gets paid', d: 'Paid every week, 7 days after you accept.' },
] as const;
const fmt = (ms: number) => `0:${String(Math.floor(ms / 1000)).padStart(2, '0')}`;

function Scene({ n }: { n: number }) {
  const imgs = ['saffron-table', 'clinic-desk', 'folio-studio'].map(imageFor);
  if (n === 0) {
    return (
      <div className="evs evs-cards">
        {imgs.map(
          (img, i) =>
            img && (
              <div key={i} className="evs-card" style={{ animationDelay: i * 0.35 + 's' }}>
                <Image src={img.src} alt="" fill sizes="220px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
              </div>
            ),
        )}
        <span className="chip mint evs-pop">
          <i />
          Saved to your list
        </span>
      </div>
    );
  }
  if (n === 1) {
    return (
      <div className="evs evs-center">
        <div className="evs-url">
          <span className="evs-type">yourbusiness.com</span>
        </div>
        <span className="chip mint evs-pop">
          <i />
          Domain added
        </span>
      </div>
    );
  }
  if (n === 2) {
    return (
      <div className="evs evs-center">
        <div className="evs-task">
          {['Site copied to your account', 'Domain connected', 'Final checks passed'].map((t, i) => (
            <div key={t} style={{ animationDelay: 0.5 + i * 1.1 + 's' }}>
              <i />
              {t}
            </div>
          ))}
        </div>
        <div className="evs-prog">
          <i />
        </div>
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className="evs evs-center">
        <div className="evs-review">
          <div className="hv-row">
            <b>Saffron Table</b>
            <span className="chip amber evs-chip1">
              <i />
              Ready to review
            </span>
            <span className="chip mint evs-chip2">
              <i />
              Accepted
            </span>
          </div>
          <div className="hv-timer">47:59:12</div>
          <span className="btn btn-gold btn-sm evs-press">Accept site</span>
        </div>
      </div>
    );
  }
  return (
    <div className="evs evs-center">
      <div className="evs-pay">
        <small className="muted">Seller payout</small>
        <div className="hv-timer evs-money">{money(33.15)}</div>
        <span className="chip mint evs-pop">
          <i />
          Paid on Sunday
        </span>
      </div>
    </div>
  );
}

export function ExplainerVideo() {
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = useRef<number>(0);
  const total = SCENE * CHAPTERS.length;
  const i = Math.max(0, Math.min(CHAPTERS.length - 1, Math.floor(ms / SCENE)));

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      // The first frame can be stamped a hair before the effect started, which would make time negative and the chapter undefined.
      const dt = Math.max(0, t - last.current);
      last.current = Math.max(t, last.current);
      setMs((m) => (m + dt) % total);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  const c = CHAPTERS[i];
  return (
    <div className="ev" data-tone={c.tone}>
      <div className="ev-stage">
        <Scene key={i} n={i} />
        <div className="ev-cap">
          <span>{i + 1}</span>
          <div>
            <b>{c.t}</b>
            <small>{c.d}</small>
          </div>
        </div>
      </div>
      <div className="ev-bar">
        <button type="button" className="ev-play" aria-label={playing ? 'Pause explainer' : 'Play explainer'} onClick={() => setPlaying((p) => !p)}>
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="ev-chapters" role="group" aria-label="Chapters">
          {CHAPTERS.map((ch, n) => (
            <button key={ch.t} type="button" aria-current={n === i} onClick={() => setMs(n * SCENE)} title={ch.t}>
              <i style={{ transform: `scaleX(${n < i ? 1 : n === i ? (ms - i * SCENE) / SCENE : 0})` }} />
            </button>
          ))}
        </div>
        <span className="ev-time">
          {fmt(ms)} / {fmt(total)}
        </span>
      </div>
    </div>
  );
}
