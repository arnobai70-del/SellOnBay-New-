'use client';
import Link from 'next/link';
import { ALL_PRODUCTS, isApp, shelfLabel, platformOf } from '@/lib/apps';
import { examplesAllowed } from '@/lib/exampleMode';
import { useList } from '@/lib/saved';
import { ThumbS } from './MiniSite';

const find = (ids: string[]) => ids.map((id) => (examplesAllowed() ? ALL_PRODUCTS.find((p) => p.id === id) : undefined)).filter((p): p is NonNullable<typeof p> => !!p);

/* What a visitor has looked at and saved on this device, what they can do without an account, and the way to make one. Nothing here is stored on our side. */
export function GuestPanel() {
  const saved = find(useList('saved'));
  const recent = find(useList('recent')).slice(0, 6);
  const row = (items: typeof saved, empty: string) =>
    items.length ? (
      <ul className="gp-list">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/product/${p.id}`}>
              {isApp(p) ? (
                <span className="rv-app" style={{ background: p.app?.accent }}>
                  {p.app?.glyph}
                </span>
              ) : (
                <ThumbS theme={p.theme} />
              )}
              <span>
                <b>{p.name}</b>
                <small>{shelfLabel(platformOf(p))}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <p className="muted">{empty}</p>
    );

  return (
    <div className="wrap gp">
      <h1>Your visit</h1>
      <p className="lead">You are browsing as a visitor. Look at every product and open its demo. To buy, hire a developer or sell, make a free account.</p>

      <div className="gp-grid">
        <section className="gp-card" aria-labelledby="gp-saved">
          <h2 id="gp-saved">Saved ({saved.length})</h2>
          {row(saved, 'Tap the heart on any product to keep it here.')}
        </section>
        <section className="gp-card" aria-labelledby="gp-recent">
          <h2 id="gp-recent">Recently viewed</h2>
          {row(recent, 'Products you open show up here.')}
        </section>
        <section className="gp-card" aria-labelledby="gp-can">
          <h2 id="gp-can">What you can do now</h2>
          <ul className="gp-checks">
            <li>Browse every shelf and category</li>
            <li>Open live demos and previews</li>
            <li>Save products and compare up to three</li>
          </ul>
          <h3>With a free account</h3>
          <ul className="gp-checks gp-later">
            <li>Buy a product, paid into escrow until you accept it</li>
            <li>Hire a developer or ask a seller a question</li>
            <li>Sell your own websites, apps and files</li>
          </ul>
        </section>
      </div>

      <div className="gp-cta">
        <Link className="btn btn-blue" href="/login">
          Sign in or make an account
        </Link>
        <Link className="btn btn-line" href="/sell">
          Sell on SellOnBay
        </Link>
        <Link className="btn btn-line" href="/categories">
          All categories
        </Link>
      </div>
      <p className="muted gp-note">Saved and recently viewed products are kept in this browser only.</p>
    </div>
  );
}
