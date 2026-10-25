'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { money, pkgCost, pkgOffered, type Pkg, type Product } from '@/lib/data';
import { deliveryOf, platformOf, storeOf } from '@/lib/apps';
import { REVIEW_HOURS } from '@/lib/config';

type Opt = { key: Pkg; title: string; note: string };
const WEB: Opt[] = [
  { key: 'asis', title: 'Buy as is', note: 'Site goes live on your domain with demo content.' },
  { key: 'setup', title: 'With setup help', note: 'Your logo, colours and text added for you.' },
  { key: 'custom', title: 'With customisation', note: 'Extra pages or a new form. Paid upfront into escrow.' },
];
const STORE: Opt[] = [
  { key: 'asis', title: 'Buy as is', note: 'Source code and a build guide. You publish it yourself.' },
  { key: 'setup', title: 'Rebrand and build', note: 'Your name, icon and colours, built and tested for you.' },
  { key: 'custom', title: 'With customisation', note: 'Extra screens or features. Paid upfront into escrow.' },
];
const HOST: Opt[] = [
  { key: 'asis', title: 'Buy as is', note: 'Source code and a deploy guide. You host it yourself.' },
  { key: 'setup', title: 'Rebrand and deploy', note: 'Your name and colours, live on your domain.' },
  { key: 'custom', title: 'With customisation', note: 'Extra features or pages. Paid upfront into escrow.' },
];
const INSTALLER: Opt[] = [
  { key: 'asis', title: 'Buy as is', note: 'Source code and a build guide. You build it yourself.' },
  { key: 'setup', title: 'Rebrand and build installers', note: 'Your name and icon, with installers ready to share.' },
  { key: 'custom', title: 'With customisation', note: 'Extra features. Paid upfront into escrow.' },
];

const DOWNLOAD: Opt[] = [
  { key: 'asis', title: 'Buy as is', note: 'Your files right after you pay, through a secure expiring link.' },
  { key: 'setup', title: 'With setup help', note: 'The seller installs and connects it for you.' },
  { key: 'custom', title: 'With customisation', note: 'Changed to fit you. Paid upfront into escrow.' },
];

export function BuyBox({ p, locked = '' }: { p: Product; locked?: string }) {
  const [pkg, setPkg] = useState<Pkg>('asis');
  const pl = platformOf(p);
  const app = pl !== 'web';
  const dv = deliveryOf(p);
  const box = useRef<HTMLElement>(null);
  const [boxSeen, setBoxSeen] = useState(false);
  // The phone bar steps aside while the full buy box is on screen.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setBoxSeen(e.isIntersecting), { rootMargin: '0px 0px -80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const opts = (dv === 'store' ? STORE : dv === 'host' ? HOST : dv === 'installer' ? INSTALLER : dv === 'download' ? DOWNLOAD : WEB).filter((o) => pkgOffered(p, o.key)); // only what the seller offers
  return (
    <>
      <aside className="buybox" id="buy" ref={box} aria-label={app ? 'Buy this app' : 'Buy this site'}>
        <div className="price">{money(p.price + pkgCost(p, pkg))}</div>
        <p className="muted">
          {dv === 'store'
            ? 'One-time price. Your store account details are added at checkout.'
            : dv === 'installer'
              ? 'One-time price. You choose your computers at checkout.'
              : dv === 'download'
                ? 'One-time price. You get your files as soon as your payment is held in escrow.'
                : 'One-time price. Domain and hosting are chosen at checkout.'}
        </p>
        {opts.map((o) => (
          <label className="opt" key={o.key}>
            <input type="radio" name="pkg" value={o.key} checked={pkg === o.key} onChange={() => setPkg(o.key)} />
            <div>
              <b>
                {o.title} <span>{o.key === 'asis' ? money(p.price) : '+' + money(pkgCost(p, o.key))}</span>
              </b>
              <span>{o.note}</span>
            </div>
          </label>
        ))}
        <dl className="kv">
          <dt>{dv === 'store' ? 'Test build in' : dv === 'installer' ? 'Installers in' : dv === 'download' ? 'Files' : 'Delivery'}</dt>
          <dd>{dv === 'download' ? 'Right after payment' : p.days === 1 ? '1 day' : '1 to ' + p.days + ' days'}</dd>
          {dv === 'store' && (
            <>
              <dt>{storeOf(p)} review</dt>
              <dd>Up to the store</dd>
            </>
          )}
          <dt>Review time</dt>
          <dd>{REVIEW_HOURS} hours</dd>
          <dt>Bug-fix guarantee</dt>
          <dd>7 days</dd>
        </dl>
        {locked ? (
          <p className="note warn" role="note" data-example-note style={{ marginTop: 20 }}>
            <span>{locked}</span>
          </p>
        ) : null}
        <Link
          className="btn btn-blue btn-lg"
          href={`/checkout?id=${p.id}&pkg=${pkg}`}
          style={{ width: '100%', marginTop: 20, ...(locked ? { display: 'none' } : {}) }}
          aria-hidden={locked ? true : undefined}
          tabIndex={locked ? -1 : undefined}
        >
          Continue to checkout
        </Link>
        <p className="muted" style={{ fontSize: 14, marginTop: 12, textAlign: 'center' }}>
          Held in escrow until you accept
        </p>
      </aside>
      <div className="buybar" data-hide={boxSeen || undefined} aria-hidden={boxSeen || undefined}>
        <div>
          <b>{money(p.price + pkgCost(p, pkg))}</b>
          <small>Held in escrow until you accept</small>
        </div>
        <a className="btn btn-blue" href="#buy" tabIndex={boxSeen ? -1 : undefined}>
          {locked ? 'See details' : 'Buy now'}
        </a>
      </div>
    </>
  );
}
