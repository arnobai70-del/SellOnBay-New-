'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Frame } from './MiniSite';
import { Scene3D } from './Scene3D';
import { PRODUCTS, imageFor, money, photoFor, showcaseId, type ThemeKey } from '@/lib/data';

const SCRIPT: [string, ThemeKey][] = [
  ['mariasbakery.com', 'restaurant'],
  ['alvarezdental.com', 'clinic'],
  ['noorrahman.design', 'portfolio'],
  ['harborshop.co', 'store'],
  ['forgefit.com', 'gym'],
];
const TABS: [ThemeKey, string][] = [
  ['restaurant', 'Restaurant'],
  ['clinic', 'Clinic'],
  ['portfolio', 'Portfolio'],
  ['store', 'Store'],
  ['gym', 'Gym'],
];
const LOWEST = Math.min(...PRODUCTS.map((p) => p.price));
const HEADLINE = 'Pick a site. Add your domain. Go live.';

const clean = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '') || 'yourdomain.com';
const label = (d: string) => {
  const w = (d.split('.')[0] || 'your name').replace(/[-_]+/g, ' ').trim();
  return w.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Your Name';
};

/* The product's memorable moment: a domain types itself and the site on the right follows. */
export function HeroDemo() {
  const router = useRouter();
  const [value, setValue] = useState('mariasbakery.com');
  const [theme, setTheme] = useState<ThemeKey>('restaurant');
  const [chip, setChip] = useState({ state: 'live', text: 'Live on mariasbakery.com' });
  const [typing, setTyping] = useState(false);
  const [manual, setManual] = useState(false); // true once the visitor takes over from the autoplay
  const auto = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idx = useRef(0);
  const valueRef = useRef(value);
  const input = useRef<HTMLInputElement>(null);

  const put = (v: string) => {
    valueRef.current = v;
    setValue(v);
  };

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    auto.current = true;
    const wait = (ms: number, fn: () => void) => {
      timer.current = setTimeout(() => auto.current && fn(), ms);
    };
    const type = (text: string, i = 0) => {
      setTyping(true);
      put(text.slice(0, i));
      if (i < text.length) return wait(70 + Math.random() * 60, () => type(text, i + 1));
      setTyping(false);
      setChip({ state: 'live', text: 'Live on ' + text });
      wait(2600, () => erase(text));
    };
    const erase = (from: string) => {
      setTyping(true);
      setChip({ state: 'work', text: 'Adding your domain' });
      const step = (cur: string) => {
        if (!cur.length) {
          idx.current = (idx.current + 1) % SCRIPT.length;
          setTheme(SCRIPT[idx.current][1]);
          return wait(350, () => type(SCRIPT[idx.current][0]));
        }
        const next = cur.slice(0, -2);
        put(next);
        wait(28, () => step(next));
      };
      step(from);
    };
    setChip({ state: 'work', text: 'Adding your domain' });
    wait(900, () => {
      put('');
      setTheme(SCRIPT[0][1]);
      type(SCRIPT[0][0]);
    });
    return () => {
      auto.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  /* any user input ends the autoplay */
  const stop = () => {
    if (!auto.current) return;
    auto.current = false;
    clearTimeout(timer.current);
    setTyping(false);
    setManual(true);
  };

  const domain = clean(value);
  const live = manual || chip.state === 'live';
  const target = SCRIPT[idx.current][0];
  const progress = live ? 1 : typing ? Math.min(0.9, Math.max(0.08, value.length / target.length)) : 0.08;
  const phoneImg = imageFor(showcaseId(theme) ?? '');

  return (
    <>
      <div className="wrap">
        <div>
          <h1>
            {HEADLINE.split(/\s+/).map((w, i) => (
              <Fragment key={i}>
                <span className="w">
                  <i style={{ '--i': i } as React.CSSProperties}>{w}</i>
                </span>{' '}
              </Fragment>
            ))}
          </h1>
          <p className="lead">Ready-made websites, built with AI and checked by us. Live in 1 to 7 days, no code.</p>
          <form
            className="domain-box"
            onSubmit={(e) => {
              e.preventDefault();
              router.push('/browse?domain=' + encodeURIComponent(value.trim()));
            }}
          >
            <label htmlFor="hero-domain">Your domain</label>
            <input
              id="hero-domain"
              ref={input}
              value={value}
              autoComplete="off"
              spellCheck={false}
              data-typing={typing ? '1' : undefined}
              onChange={(e) => {
                stop();
                put(e.target.value);
              }}
              onFocus={() => {
                // Taking over mid-typing would leave half a domain, so finish the current example first.
                if (auto.current) put(SCRIPT[idx.current][0]);
                stop();
              }}
            />
            <button className="btn btn-gold" type="submit">
              See sites
            </button>
          </form>
          <div className="hero-links">
            <Link href="/browse">Browse all sites</Link>
            <Link href="/sell">Sell yours</Link>
          </div>
        </div>
        <div className="hero-demo">
          <Scene3D className="hero-3d">
            <div className="s3-l hero-frame3d" style={{ '--z': 0, '--d': 0 } as React.CSSProperties}>
              <div className="price-tag" aria-hidden="true">
                Sites from {money(LOWEST)}
              </div>
              <div data-hero-frame aria-live="polite">
                <Frame theme={theme} brand={label(domain)} url={domain} photo={photoFor(theme)} />
              </div>
            </div>
            <div className="s3-l hero-phone" aria-hidden="true" style={{ '--z': 70, '--d': 14, '--delay': '.6s' } as React.CSSProperties}>
              <div className="hp-notch" />
              <div className="hp-screen">
                {phoneImg ? (
                  <Image key={theme} src={phoneImg.src} alt="" fill sizes="140px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
                ) : (
                  <Frame theme={theme} brand={label(domain)} url={domain} photo={photoFor(theme)} />
                )}
              </div>
            </div>
            <div className="s3-l hero-status" role="status" aria-label={live ? `Live on ${domain}` : 'Launching your site'} style={{ '--z': 120, '--d': 20, '--delay': '1.1s' } as React.CSSProperties}>
              <b>{live ? 'Your site is live' : 'Launching your site'}</b>
              <ul>
                <li className="on">
                  <i />
                  Site chosen
                </li>
                <li className={live ? 'on' : 'busy'}>
                  <i />
                  Domain added
                </li>
                <li className={live ? 'on' : ''}>
                  <i />
                  Live in 1 to 7 days
                </li>
              </ul>
              <div className="hs-bar">
                <i style={{ width: Math.round(progress * 100) + '%' }} />
              </div>
            </div>
          </Scene3D>
          <div className="demo-tabs" role="group" aria-label="Preview style">
            {TABS.map(([k, t]) => (
              <button
                key={k}
                type="button"
                aria-pressed={theme === k}
                onClick={() => {
                  stop();
                  setTheme(k);
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="live-chip" id="live-chip" data-state={manual ? 'live' : chip.state} aria-live="off">
            <i />
            <span>{manual ? 'Live on ' + (value.trim() || 'your domain') : chip.text}</span>
          </div>
        </div>
      </div>
    </>
  );
}
