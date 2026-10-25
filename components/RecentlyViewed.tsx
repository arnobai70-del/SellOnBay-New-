'use client';
import Link from 'next/link';
import { ALL_PRODUCTS, isApp, platformOf, type Platform } from '@/lib/apps';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { examplesAllowed } from '@/lib/exampleMode';
import { useList } from '@/lib/saved';
import { ThumbS } from './MiniSite';

export function RecentlyViewed({ kind = 'web' }: { kind?: Platform }) {
  const ids = useList('recent');
  const items = ids
    .map((id) => (examplesAllowed() ? ALL_PRODUCTS.find((p) => p.id === id) : undefined))
    .filter((p): p is NonNullable<typeof p> => !!p && platformOf(p) === kind)
    .slice(0, 5);
  if (!items.length) return null;
  return (
    <div className="recent-wrap">
      <h2>Pick up where you left off</h2>
      <div className="recent">
        {items.map((p) => (
          <Link key={p.id} href={`/product/${p.id}`}>
            {isApp(p) ? (
              <span className="rv-app" style={{ background: p.app?.accent }}>
                {p.app?.glyph}
              </span>
            ) : (
              <ThumbS theme={p.theme} />
            )}
            <span>
              <b>{p.name}</b>
              {SHOW_LIST_PRICES && <small>${p.price}</small>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
