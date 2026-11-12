import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { pkgOffered } from '@/lib/data';
import { sellerByHandle } from '@/lib/glass/catalog';
import { getSettings } from '@/lib/settings';

import { T } from '@/components/i18n/T';
type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await sellerByHandle((await params).username);
  if (!s) return { title: 'Not found', robots: { index: false } };
  const description = (s.headline || s.about || `Full-stack websites by ${s.name}, with a live demo and escrow protection.`).slice(0, 160);
  return { title: `${s.name}: seller store`, description, alternates: { canonical: `/sellers/${s.handle}` }, openGraph: { title: s.name, description, url: `/sellers/${s.handle}` } };
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'S';

/*
 * design-reference/seller.html, for every seller with a live website (SellOnBay's own store too). Customization is asked for on a website of the
 * seller at checkout (the "With customisation" package), paid through escrow; in the free beta paid custom work waits until live payments.
 */
export default async function SellerStore({ params }: Props) {
  const s = await sellerByHandle((await params).username);
  if (!s) notFound();
  const { paymentsMode } = await getSettings();
  const beta = paymentsMode === 'beta_free';
  const custom = s.websites.filter((w) => pkgOffered(w, 'custom'));
  const first = s.name.split(/\s+/)[0];
  return (
    <PublicFrame file="seller">
      <section className="glass" style={{ marginTop: 40, padding: 32, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          style={{ width: 96, height: 96, borderRadius: '50%', background: '#E6E2F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 400, flex: 'none' }}
          aria-hidden="true"
        >
          {initials(s.name)}
        </span>
        <div style={{ flex: '1 1 300px' }}>
          <h1 style={{ fontSize: 32 }}>{s.name}</h1>
          {s.headline && (
            <div className="muted" style={{ marginTop: 6 }}>
              {s.headline}
            </div>
          )}
          {(s.customAvailable || s.verified) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: '#1A5444' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3F8F77' }} />
              {s.customAvailable ? 'Available for customization' : 'Verified seller'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div className="stat">{s.websites.length}</div>
            <div className="tag">
              <T s={'Websites'} />
            </div>
          </div>
          <div>
            <div className="stat">{s.sold}</div>
            <div className="tag">
              <T s={'Sales'} />
            </div>
          </div>
          <div>
            <div className="stat">{s.joined ? new Date(s.joined).getUTCFullYear() : '—'}</div>
            <div className="tag">
              <T s={'Member since'} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <Link className="btn ghost" href="/dashboard/buyer/support?new=1" prefetch={false}>
            <T s={'Message'} />
          </Link>
          <Link href="/report-abuse" style={{ fontSize: 12, color: '#566C78' }} prefetch={false}>
            <T s={'Report this seller'} />
          </Link>
        </div>
      </section>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 24 }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div>
            <h2 style={{ fontSize: 22, marginBottom: 10 }}>
              <T s={'About'} />
            </h2>
            <p className="muted" style={{ margin: 0, lineHeight: 1.65, fontSize: 15 }}>
              {s.about || `${s.name} sells full-stack websites on SellOnBay, each with a live demo and escrow protection.`}
            </p>
            {s.skills.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {s.skills.map((x) => (
                  <span key={x} className="pill">
                    {x}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="glass" style={{ padding: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              <div>
                <div style={{ fontSize: 38, fontWeight: 300 }}>{s.reviews ? s.rating.toFixed(1) : '—'}</div>
                <div style={{ color: '#E0A93B', letterSpacing: 2 }} aria-label={s.reviews ? `${s.rating.toFixed(1)} out of 5` : 'No ratings yet'}>
                  {s.reviews ? '★'.repeat(Math.round(s.rating)) + '☆'.repeat(5 - Math.round(s.rating)) : '☆☆☆☆☆'}
                </div>
                <div className="tag">
                  <T s={'{reviews} verified {v1}'} v={{ reviews: s.reviews, v1: s.reviews === 1 ? 'buyer' : 'buyers' }} />
                </div>
              </div>
              <div style={{ flex: '1 1 260px', fontSize: 14, lineHeight: 1.6 }}>
                <b style={{ fontWeight: 500 }}>
                  <T s={'Reviews'} />
                </b>{' '}
                <span className="muted">
                  <T s={'· verified buyers only'} />
                </span>
                <br />
                <span className="muted">{s.reviews ? 'Read them on each website page.' : 'No reviews yet. Only buyers who received a website can review it.'}</span>
              </div>
            </div>
            <h2 style={{ fontSize: 22, marginBottom: 16 }}>
              <T s={'Websites by {first}'} v={{ first }} />
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 20 }}>
              {s.websites.map((p) => (
                <WebsiteCard key={p.id} p={p} />
              ))}
            </div>
          </div>
        </div>
        <aside className="glass" style={{ flex: '1 1 300px', maxWidth: 380, padding: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20 }}>
                <T s={'Request customization'} />
              </h2>
              {beta && (
                <span className="status st-draft">
                  <T s={'Coming soon'} />
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              {beta ? 'Paid custom work is available after the beta.' : 'Paid through escrow, like a website. You pay nothing until you accept a quotation.'}
            </div>
          </div>
          <form action="/checkout" method="get" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="pkg" value="custom" />
            <div className="field">
              <label htmlFor="tp">
                <T s={'Based on website'} />
              </label>
              <select id="tp" name="id" className="input" disabled={beta || !custom.length}>
                {(custom.length ? custom : s.websites).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" style={{ width: '100%' }} disabled={beta || !custom.length}>
              <T s={'Send request'} />
            </button>
            {!beta && !custom.length && (
              <div className="tag">
                <T s={'This seller does not offer customization on a website yet.'} />
              </div>
            )}
          </form>
        </aside>
      </div>
    </PublicFrame>
  );
}
