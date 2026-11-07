import Link from 'next/link';
import type { Product } from '@/lib/data';
import { GlassCard } from './GlassCard';

/* One website in a list. The price is in USD, as everywhere (owner, 2026-11-07). The picture is the seller's first screenshot, or a drawn page. */
export function WebsiteCard({ p, reveal = false }: { p: Product; reveal?: boolean }) {
  return (
    <GlassCard as="article" pad={false} lift reveal={reveal} rise={!reveal} className="g-site">
      <Link className="g-site-a" href={`/websites/${p.id}`}>
        <div className="g-thumb" aria-hidden="true">
          {p.shots?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- seller screenshots are served from our own private route, in any size
            <img src={p.shots[0]} alt="" loading="lazy" decoding="async" />
          ) : (
            <>
              <span className="g-tb" />
              <span className="g-ln" />
              <span className="g-ln g-ln-s" />
              <span className="g-blk" />
            </>
          )}
        </div>
        <div className="g-site-m">
          <div style={{ minWidth: 0 }}>
            <h3>{p.name}</h3>
            <div className="g-tag">
              {p.stack ? `${p.stack} · ` : ''}by {p.seller}
              {p.reviews > 0 ? ` · ★ ${p.rating.toFixed(1)}` : ''}
            </div>
          </div>
          <div className="g-site-p">${p.price}</div>
        </div>
      </Link>
    </GlassCard>
  );
}
