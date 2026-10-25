'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Globe3D } from './Globe3D';

const EXAMPLES = ['mariasbakery.com', 'northsidedental.com', 'folio.studio', 'greenleaf.shop'];
const CHAPTERS: { t: string; d: string; href: string; link: string }[] = [
  { t: 'Choose what you need', d: 'Ready-made websites and apps, built with AI and checked by us. Sellers deliver the same product again and again.', href: '/browse', link: 'Browse sites' },
  { t: 'Bring your name', d: 'Use a domain you own, or register one here. It is always registered in your name.', href: '/domains', link: 'Find a domain' },
  { t: 'Launch in days', d: 'Live in 1 to 7 days. Your money waits in escrow until you have checked it and accepted.', href: '/how-it-works', link: 'How it works' },
];

/* The home hero: a night-sky planet of live sites with the three steps beside it. The empty domain box types example names. */
export function GlobeHero() {
  const router = useRouter();
  const [val, setVal] = useState('');
  const [ph, setPh] = useState('');
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (focus || val || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPh(EXAMPLES[0]);
      return;
    }
    let i = 0,
      n = 0,
      dir = 1,
      wait = 0;
    const t = setInterval(() => {
      if (wait > 0) {
        wait--;
        return;
      }
      n += dir;
      setPh(EXAMPLES[i].slice(0, n));
      if (n >= EXAMPLES[i].length) {
        dir = -1;
        wait = 14;
      } else if (n <= 0) {
        dir = 1;
        i = (i + 1) % EXAMPLES.length;
        wait = 4;
      }
    }, 70);
    return () => clearInterval(t);
  }, [focus, val]);

  return (
    <section className="gh" data-hero-demo>
      <div className="wrap gh-in">
        <div className="gh-copy">
          <h1>
            Pick a site. Add your domain. <b>Go live.</b>
          </h1>
          <form
            className="gh-box"
            onSubmit={(e) => {
              e.preventDefault();
              router.push('/browse?domain=' + encodeURIComponent((val || EXAMPLES[0]).trim()));
            }}
          >
            <label htmlFor="gh-domain">Your domain</label>
            <input
              id="gh-domain"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              placeholder={ph}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button className="btn btn-gold" type="submit">
              See sites
            </button>
          </form>
          <ol className="gh-tl">
            {CHAPTERS.map((c) => (
              <li key={c.t}>
                <h2>{c.t}</h2>
                <p>{c.d}</p>
                <Link href={c.href}>{c.link}</Link>
              </li>
            ))}
          </ol>
        </div>
        <div className="gh-stage">
          <Globe3D />
        </div>
      </div>
    </section>
  );
}
