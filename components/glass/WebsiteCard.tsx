import Image from 'next/image';
import Link from 'next/link';
import { publicSlug } from '@/lib/glass/publicSlug';
import { PriceTag } from './PriceTag';
import type { Product } from '@/lib/data';

import { T } from '@/components/i18n/T';
/* The tints of the design's drawn pages (design-reference/websites.html), picked by the listing so each card keeps its colour. */
const TINTS: [string, string, string][] = [
  ['#D3EEE4', '#DDEAF6', '#F1E8DD'],
  ['#DDEAF6', '#E6E2F4', '#D3EEE4'],
  ['#E6E2F4', '#F6E0EA', '#DDEAF6'],
  ['#F1E8DD', '#D3EEE4', '#E6E2F4'],
];
const tint = (id: string) => TINTS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length];

/*
 * One website in a list, as the design's <a class="glass card">: the drawn page (or the seller's first screenshot), the name, stack, seller and
 * rating, and the price in USD (owner, 2026-11-07) with a real sale when there is one (PriceTag).
 */
export function WebsiteCard({ p }: { p: Product; reveal?: boolean }) {
  const [m, l, b] = tint(p.id);
  return (
    <Link className="glass card" href={`/websites/${publicSlug(p.id)}`} prefetch={false}>
      <div className="thumb" aria-hidden="true" style={p.shots?.[0] ? { padding: 0, position: 'relative', overflow: 'hidden' } : undefined}>
        {p.shots?.[0] ? (
          <Image src={p.shots[0]} alt="" fill sizes="(max-width: 760px) 100vw, 400px" style={{ objectFit: 'cover', objectPosition: 'top', borderRadius: 14 }} />
        ) : (
          <>
            <div className="tb" />
            <div style={{ display: 'flex', gap: 10, flex: 1 }}>
              <div className="side" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="sq" style={{ background: m }} />
                  <span className="sq" style={{ background: l }} />
                  <span className="sq" style={{ background: b }} />
                </div>
                <span className="ln" />
                <span className="ln" />
                <span className="ln s" />
                <span className="ln" />
              </div>
            </div>
          </>
        )}
      </div>
      <div className="meta">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{p.name}</div>
          <div className="tag">
            <T s={'{v0}by {seller}{v2}'} v={{ v0: p.stack ? `${p.stack} · ` : '', seller: p.seller, v2: p.reviews > 0 ? ` · ★ ${p.rating.toFixed(1)}` : '' }} />
          </div>
        </div>
        <div style={{ fontWeight: 500, fontSize: 17, textAlign: 'right' }}>
          <PriceTag p={p} />
        </div>
      </div>
    </Link>
  );
}
