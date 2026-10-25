'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { Product } from '@/lib/data';
import { flags } from '@/lib/flags';
import { SHELVES, deliveryOf, platformOf, storeOf } from '@/lib/apps';
import { AppArt } from './AppPhone';

/* The app's screens on a phone you can flip through. Seller screenshots replace the drawn ones when they exist. */
const NAMES = ['Home', 'Browse', 'Stats'];

export function AppPreview({ p }: { p: Product }) {
  const pl = platformOf(p);
  const names = pl === 'digital' ? ['Files', 'Overview', 'Guide'] : NAMES;
  const [i, setI] = useState(0);
  if (pl === 'web') return null;
  const shots = p.shots ?? [];
  const wide = SHELVES[pl].delivery !== 'store';
  const accent = p.app?.accent ?? '#2B3DFF';
  const bg = p.app?.bg ?? '#F4F6FF';

  return (
    <section className="apv" aria-label="App preview">
      <div className="apv-bar">
        {p.stack && (
          <span className="chip">
            {pl === 'digital' ? 'For ' : 'Built with '}
            {p.stack}
          </span>
        )}
        {deliveryOf(p) === 'store' && <span className="chip">For {storeOf(p)}</span>}
        {deliveryOf(p) === 'host' && <span className="chip">Runs on your domain</span>}
        {deliveryOf(p) === 'installer' && <span className="chip">Windows, macOS or Linux</span>}
        {deliveryOf(p) === 'download' && <span className="chip">Files right after payment</span>}
        {pl === 'digital' && p.sample && flags.freeSample && (
          <a className="chip" href={p.sample} target="_blank" rel="noopener noreferrer nofollow">
            Free sample
          </a>
        )}
        {pl === 'digital' && p.demo?.type === 'url' && /^https:/.test(p.demo.src) && (
          <a className="chip" href={p.demo.src} target="_blank" rel="noopener noreferrer">
            View a demo
          </a>
        )}
      </div>
      <div className="apv-stage" style={{ background: `linear-gradient(160deg, ${accent}2e, ${bg})` }}>
        {shots.length ? (
          <div className={'apv-shots' + (wide ? ' wide' : '')}>
            {shots.map((s, n) => (
              <span key={s} className={'apv-shot' + (wide ? ' wide' : '')}>
                <Image src={s} alt={`${p.name} screen ${n + 1}`} fill sizes="260px" unoptimized style={{ objectFit: 'cover', objectPosition: 'top' }} />
              </span>
            ))}
          </div>
        ) : (
          <>
            {wide ? (
              <div className="apv-win">
                <AppArt p={p} screen={i} className="aw-big" />
              </div>
            ) : (
              <div className="apv-phones" data-active={i}>
                {[0, 1, 2].map((n) => (
                  <button key={n} type="button" className="apv-ph" data-n={n} aria-pressed={i === n} aria-label={`Show the ${names[n]} screen`} onClick={() => setI(n)}>
                    <AppArt p={p} screen={n} />
                  </button>
                ))}
              </div>
            )}
            <div className="apv-tabs" role="group" aria-label="App screens">
              {names.map((n, k) => (
                <button key={n} type="button" aria-pressed={i === k} onClick={() => setI(k)}>
                  {n}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="muted pf-note">
        {shots.length ? 'Screenshots from the seller.' : 'A drawn preview of the main screens.'}{' '}
        {deliveryOf(p) === 'store'
          ? 'Your seller sends you a real test build to try on your own phone before you accept.'
          : deliveryOf(p) === 'host'
            ? 'Your seller sends you a private test link to try it before you accept.'
            : deliveryOf(p) === 'download'
              ? 'You get the files as soon as your payment is held in escrow, and 48 hours to check them before the seller is paid.'
              : 'Your seller sends you real installers to try on your own computer before you accept.'}
      </p>
    </section>
  );
}
