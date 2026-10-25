'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HeroDemo } from './HeroDemo';
import { LiquidMetal } from './LiquidMetal';
import { Scene3D } from './Scene3D';
import { imageFor, money } from '@/lib/data';

const MS = 9000;
const SLIDES = [
  { tone: 'cobalt', label: 'Pick a site and add your domain' },
  { tone: 'mint', label: 'Sell the site you built' },
  { tone: 'gold', label: 'Your money waits until the site works' },
] as const;

const BARS: [string, number][] = [
  ['Mon', 40],
  ['Tue', 62],
  ['Wed', 48],
  ['Thu', 80],
  ['Fri', 70],
  ['Sat', 100],
  ['Sun', 86],
];
const STEPS: [string, string, 'is-done' | 'is-now' | ''][] = [
  ['You pay', 'Held by SellOnBay', 'is-done'],
  ['Seller builds', 'On your domain', 'is-done'],
  ['You review', '48 hours to check', 'is-now'],
  ['You accept', 'Final once accepted', ''],
  ['Seller is paid', '7 days later', ''],
];

/* Three hero slides, each in its own brand colour. Slides never auto-advance for reduced motion or while the pointer or focus is inside. */
export function HeroSlides({ children }: { children?: React.ReactNode }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const [still, setStill] = useState(false);
  const saffron = imageFor('saffron-table');
  const clinic = imageFor('clinic-desk');

  useEffect(() => {
    setStill(matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  useEffect(() => {
    if (hold || still) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), MS);
    return () => clearTimeout(t);
  }, [i, hold, still]);

  return (
    <section className="hero" data-hero-demo data-tone={SLIDES[i].tone}>
      <LiquidMetal tone={SLIDES[i].tone} />
      <div className="sun" aria-hidden="true" />
      <div
        className="slides"
        aria-roledescription="carousel"
        aria-label="SellOnBay highlights"
        onMouseEnter={() => setHold(true)}
        onMouseLeave={() => setHold(false)}
        onFocusCapture={() => setHold(true)}
        onBlurCapture={() => setHold(false)}
      >
        <div className={'slide' + (i === 0 ? ' on' : '')} aria-hidden={i !== 0} inert={i !== 0}>
          <HeroDemo />
        </div>

        <div className={'slide' + (i === 1 ? ' on' : '')} aria-hidden={i !== 1} inert={i !== 1}>
          <div className="wrap">
            <div className="slide-copy">
              <h2 className="hl">Sell the site you already built.</h2>
              <p className="lead">Upload it once and deliver it to every buyer. You keep 85% of every sale, paid every week.</p>
              <div className="slide-cta">
                <Link className="btn btn-dark btn-lg" href="/sell">
                  List your first site
                </Link>
                <Link className="hero-link" href="/dashboard/seller">
                  See a seller dashboard
                </Link>
              </div>
            </div>
            <Scene3D className="comp">
              <div className="card c-list s3-l" style={{ '--z': 40, '--d': 10 } as React.CSSProperties}>
                {saffron && (
                  <div className="c-img">
                    <Image src={saffron.src} alt="" width={saffron.width} height={saffron.height} sizes="320px" />
                  </div>
                )}
                <div className="c-row">
                  <div>
                    <b>Saffron Table</b>
                    <span>{money(39)} · 214 sold</span>
                  </div>
                  <span className="chip mint">
                    <i />
                    Live
                  </span>
                </div>
              </div>
              <div className="card c-earn s3-l" style={{ '--z': 80, '--d': 16 } as React.CSSProperties}>
                <small>Available to withdraw</small>
                <b>{money(642)}</b>
                <div className="c-bars">
                  {BARS.map(([d, h]) => (
                    <i key={d} style={{ height: h + '%' }} />
                  ))}
                </div>
                <span className="chip blue">
                  <i />
                  Next payout Sunday
                </span>
              </div>
              <div className="pill-note s3-l" style={{ '--z': 110, '--d': 20 } as React.CSSProperties}>
                <span className="dot" />
                New order. You earn {money(33.15)}
              </div>
            </Scene3D>
          </div>
        </div>

        <div className={'slide' + (i === 2 ? ' on' : '')} aria-hidden={i !== 2} inert={i !== 2}>
          <div className="wrap">
            <div className="slide-copy">
              <h2 className="hl">Your money waits until the site works.</h2>
              <p className="lead">Payment is held in escrow. Check the live site for 48 hours, accept it, and only then is the seller paid.</p>
              <div className="slide-cta">
                <Link className="btn btn-dark btn-lg" href="/how-it-works">
                  See how it works
                </Link>
                <Link className="hero-link" href="/browse">
                  Browse sites
                </Link>
              </div>
            </div>
            <Scene3D className="comp">
              <div className="card c-steps s3-l" style={{ '--z': 40, '--d': 10 } as React.CSSProperties}>
                <h3>Your order</h3>
                <ol>
                  {STEPS.map(([t, s, st]) => (
                    <li key={t} className={st}>
                      <i />
                      <div>
                        <b>{t}</b>
                        <span>{s}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="card c-deliv s3-l" style={{ '--z': 80, '--d': 16 } as React.CSSProperties}>
                {clinic && (
                  <div className="c-img">
                    <Image src={clinic.src} alt="" width={clinic.width} height={clinic.height} sizes="320px" />
                  </div>
                )}
                <div className="c-row">
                  <div>
                    <b>Clinic Desk</b>
                    <span>47:59:12 left to review</span>
                  </div>
                  <span className="chip amber">
                    <i />
                    Ready
                  </span>
                </div>
                <div className="c-btns">
                  <span className="btn btn-gold btn-sm">Accept site</span>
                  <span className="btn btn-line btn-sm">Report problem</span>
                </div>
              </div>
              <div className="pill-note lock s3-l" style={{ '--z': 110, '--d': 20 } as React.CSSProperties}>
                <span className="dot" />
                {money(69)} held safely
              </div>
            </Scene3D>
          </div>
        </div>
      </div>

      <div className="wrap dots-wrap">
        <div className="dots" role="group" aria-label="Choose slide">
          {SLIDES.map((s, n) => (
            <button key={s.tone} type="button" aria-label={`Slide ${n + 1}: ${s.label}`} aria-current={n === i} className={hold || still ? 'paused' : ''} onClick={() => setI(n)}>
              <span />
            </button>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}
