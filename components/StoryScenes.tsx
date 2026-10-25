'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { SELLER_KEEP_TEXT } from '@/lib/config';
import { DEVS, fromPrice } from '@/lib/developers';
import { DevAvatar } from './DevParts';

export type Shot = { id: string; name: string; src: string; width: number; height: number };

const NAME = 'mariasbakery';
const ENDINGS: [string, string][] = [
  ['.com', '$14'],
  ['.co', '$29'],
  ['.shop', '$12'],
];
const STEPS: [string, string][] = [
  ['You pay', 'Money goes into escrow, not to the seller.'],
  ['Seller builds', 'On your domain, in 1 to 7 days.'],
  ['You review', '48 hours to click around.'],
  ['You accept', 'Or ask for a fix. Bugs are fixed for 7 days.'],
  ['Seller is paid', 'Weekly, 7 days after you accept.'],
];
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/* Four scenes, each built differently. Every scene reads its own scroll progress (0 to 1) into the CSS variable --p; scenes 1 to 3
   stay pinned while you scroll through them. With reduced motion nothing is pinned and every scene shows its finished picture. */
export function StoryScenes({ shots }: { shots: Shot[] }) {
  const s1 = useRef<HTMLElement>(null),
    s2 = useRef<HTMLElement>(null),
    s3 = useRef<HTMLElement>(null),
    s4 = useRef<HTMLElement>(null);
  const typed = useRef<HTMLSpanElement>(null),
    tld = useRef<HTMLSpanElement>(null),
    state = useRef<HTMLSpanElement>(null),
    earn = useRef<HTMLElement>(null);

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const progress = (el: HTMLElement | null, pinned: boolean) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect(),
        vh = innerHeight;
      return clamp(pinned ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (vh + r.height));
    };
    const draw = () => {
      raf = 0;
      const pinned = innerWidth > 980;
      const p1 = still ? 0.5 : progress(s1.current, pinned),
        p2 = still ? 1 : progress(s2.current, pinned),
        p3 = still ? 1 : progress(s3.current, pinned),
        p4 = still ? 1 : progress(s4.current, false);
      s1.current?.style.setProperty('--p', p1.toFixed(4));
      s2.current?.style.setProperty('--p', p2.toFixed(4));
      s3.current?.style.setProperty('--p', p3.toFixed(4));
      s4.current?.style.setProperty('--p', p4.toFixed(4));
      // scene 2: the name types itself, then the ending cycles
      const n = Math.round(clamp(p2 / 0.55) * NAME.length),
        e = p2 < 0.72 ? 0 : p2 < 0.86 ? 1 : 2;
      if (typed.current) typed.current.textContent = NAME.slice(0, n);
      if (tld.current) tld.current.textContent = n === NAME.length ? ENDINGS[e][0] : '';
      if (state.current) state.current.textContent = n === NAME.length ? `Available, ${ENDINGS[e][1]} a year` : 'Checking…';
      // scene 3: the coin travels, and each step lights up as it passes
      const k = clamp((p3 - 0.1) / 0.75);
      s3.current?.style.setProperty('--k', k.toFixed(4));
      s3.current?.setAttribute('data-step', String(Math.min(4, Math.floor(k * 4.999))));
      // scene 4: the number counts up
      if (earn.current) earn.current.textContent = '$' + Math.round(642 * (1 - Math.pow(1 - clamp(p4 / 0.45), 3)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    draw();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', on);
      removeEventListener('resize', on);
    };
  }, []);

  const row = (rev: boolean) => (
    <div className={'sc1-row' + (rev ? ' rev' : '')} aria-hidden="true">
      {[...(rev ? [...shots].reverse() : shots), ...shots.slice(0, 3)].map((s, i) => (
        <figure key={s.id + i} className="sc1-img">
          <Image src={s.src} alt="" width={s.width} height={s.height} sizes="240px" />
          <figcaption>{s.name}</figcaption>
        </figure>
      ))}
    </div>
  );
  const devs = ['marco-bianchi', 'lucas-ferreira', 'emily-chen', 'aisha-rahman', 'kenji-watanabe', 'priya-nair'].map((id) => DEVS.find((d) => d.id === id)!).filter(Boolean);

  return (
    <div className="sc-all">
      <section ref={s1} className="sc sc1 pin" aria-label="Choose what you need">
        <div className="sc-pin">
          <div className="sc1-rows">
            {row(false)}
            {row(true)}
          </div>
          <div className="wrap sc1-copy">
            <h2>Choose what you need</h2>
            <p className="sc-lead">Websites and apps, ready to publish. Click through the live site before you pay.</p>
            <ul className="sc-tags">
              <li>Websites and apps</li>
              <li>Any business</li>
              <li>Look before you pay</li>
              <li>Honest reviews</li>
            </ul>
            <div className="sc-links">
              <Link className="sc-main" href="/browse">
                Browse sites
              </Link>
              <Link href="/apps/android">Android apps</Link>
              <Link href="/apps/web">Web apps</Link>
            </div>
          </div>
        </div>
      </section>

      <section ref={s2} className="sc sc2 pin" aria-label="Bring your name">
        <div className="sc-pin">
          <div className="wrap">
            <h2>Bring your name</h2>
            <div className="sc2-big" aria-hidden="true">
              <span ref={typed} className="sc2-name">
                {NAME}
              </span>
              <span ref={tld} className="sc2-tld">
                .com
              </span>
              <i />
            </div>
            <p className="sc2-state">
              <span ref={state}>Available, $14 a year</span>
            </p>
            <div className="sc2-pts">
              <p>
                <b>Your own domain.</b> Use one you own, or register one here.
              </p>
              <p>
                <b>Registered to you.</b> You are the owner on record. Always.
              </p>
              <p>
                <b>Fair prices.</b> The yearly price is shown before you pay.
              </p>
              <p>
                <b>Yours to move.</b> Transfer it away whenever you like.
              </p>
            </div>
            <div className="sc-links">
              <Link className="sc-main" href="/domains">
                Find a domain
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section ref={s3} className="sc sc3 pin" aria-label="Pay only when it works" data-step="0">
        <div className="sc-pin">
          <div className="wrap">
            <h2>Pay only when it works</h2>
            <p className="sc-lead">Your money moves in five steps, and you decide when it is released.</p>
            <ol className="sc3-track">
              <li className="sc3-rail" aria-hidden="true">
                <b />
                <span className="sc3-coin">$</span>
              </li>
              {STEPS.map(([t, d], i) => (
                <li key={t} className="sc3-st" data-i={i}>
                  <i />
                  <b>{t}</b>
                  <small>{d}</small>
                </li>
              ))}
            </ol>
            <div className="sc-links">
              <Link className="sc-main" href="/how-it-works">
                How it works
              </Link>
              <Link href="/checkout?id=saffron-table">Try a demo order</Link>
            </div>
          </div>
        </div>
      </section>

      <section ref={s4} className="sc sc4" aria-label="Get help or earn">
        <div className="sc4-l">
          <div className="sc4-in">
            <h2>Hire a developer</h2>
            <p className="sc-lead">Fixed-price packages to customise a template. See the price, skills and reviews first.</p>
            <div className="sc-links">
              <Link className="sc-main" href="/developers">
                Hire a developer
              </Link>
            </div>
          </div>
          <div className="sc4-orbit" aria-hidden="true">
            <span className="sc4-core">from ${Math.min(...devs.map(fromPrice))}</span>
            {devs.map((d, i) => (
              <span key={d.id} className="sc4-sat" style={{ '--a': i * 60 + 'deg' } as React.CSSProperties}>
                <DevAvatar dev={d} size={46} />
              </span>
            ))}
          </div>
        </div>
        <div className="sc4-r">
          <div className="sc4-in">
            <h2>Sell what you built</h2>
            <p className="sc-lead">Upload once, deliver again and again, and keep {SELLER_KEEP_TEXT} of every sale.</p>
            <p className="sc4-num">
              <b ref={earn}>$642</b>
              <span>an example of a seller&apos;s balance</span>
            </p>
            <svg className="sc4-line" viewBox="0 0 300 80" aria-hidden="true" preserveAspectRatio="none">
              <path pathLength="1" d="M0 70 C40 60 50 66 80 48 S130 52 160 34 S220 38 250 14 L300 6" />
            </svg>
            <div className="sc-links">
              <Link className="sc-main" href="/sell">
                Sell a site
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
