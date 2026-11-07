import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { TrackView } from '@/components/TrackView';
import { BUGFIX_DAYS, REVIEW_HOURS } from '@/lib/config';
import { deliveryText } from '@/lib/deliveryTime';
import { visibleProduct } from '@/lib/catalog';
import { categoryPath, publicSellers, publicWebsites, websiteCategories, websitePath } from '@/lib/glass/catalog';
import { publicListing } from '@/lib/glass/words';
import { ratingOf, reviewsFor } from '@/lib/reviews';
import { isPublic } from '@/lib/seo/controls';
import { pageControls } from '@/lib/seo/controlStore';
import { listingMetadata, listingPath } from '@/lib/seo/listingMeta';
import { allPageSeo } from '@/lib/seo/pageMeta';
import { productFaqs } from '@/lib/seo/productFaq';
import { getSettings } from '@/lib/settings';
import { SITE_URL } from '@/lib/site';

/* A listing in review is private, so this page renders per request. Its page settings stay keyed by /product/<id>, where an admin saved them. */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

async function find(slug: string) {
  const found = await visibleProduct(slug);
  if (!found) return null;
  const ctl = await pageControls(listingPath(found.product.id));
  if (found.status === 'live' && !isPublic(listingPath(found.product.id), ctl)) return null;
  return { ...found, product: publicListing(found.product), ctl };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = await find(slug);
  if (!f) return { title: 'Not found', robots: { index: false } };
  const m = listingMetadata(f.product, f.status, (await allPageSeo())[listingPath(f.product.id)], f.ctl);
  const canonical = websitePath(f.product.id);
  return f.ctl.canonical ? m : { ...m, alternates: { ...m.alternates, canonical }, openGraph: { ...m.openGraph, url: canonical } };
}

export default async function Website({ params }: Props) {
  const { slug } = await params;
  const f = await find(slug);
  if (!f) notFound();
  const p = f.product;
  const [cats, reviews, rating, settings, sites, sellers] = await Promise.all([websiteCategories(), reviewsFor(p.id), ratingOf(p.id), getSettings(), publicWebsites(), publicSellers()]);
  const hub = cats.of(p);
  const url = SITE_URL + websitePath(p.id);
  const seller = sellers.find((s) => s.websites.some((w) => w.id === p.id));
  const related = sites.filter((x) => x.id !== p.id && hub && cats.of(x)?.slug === hub.slug).slice(0, 3);
  const beta = settings.paymentsMode === 'beta_free';
  return (
    <div style={{ paddingTop: 32 }}>
      <TrackView id={p.id} />
      <nav aria-label="Breadcrumb" className="g-tag" style={{ marginBottom: 12 }}>
        <Link href="/websites">Websites</Link>
        {hub && (
          <>
            {' / '}
            <Link href={categoryPath(hub.slug)}>{hub.name.replace(/ Websites$/, '')}</Link>
          </>
        )}
        {' / '}
        {p.name}
      </nav>
      <div className="g-layout-buy">
        <div className="g-stack" style={{ minWidth: 0 }}>
          <GlassCard pad={false} rise={false} style={{ padding: 12 }}>
            <div className="g-thumb g-preview">
              {p.shots?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- seller screenshots are served from our own private route, in any size
                <img src={p.shots[0]} alt={`${p.name} screenshot`} />
              ) : (
                <>
                  <span className="g-tb" />
                  <span className="g-ln" />
                  <span className="g-ln g-ln-s" />
                  <span className="g-blk" />
                </>
              )}
            </div>
          </GlassCard>
          <GlassCard as="section" rise={false}>
            <h2>About this website</h2>
            <p className="g-muted" style={{ marginTop: 8, fontSize: 15, lineHeight: 1.65 }}>
              {p.desc}
            </p>
            {p.inc.length > 0 && (
              <>
                <h3 style={{ marginTop: 18 }}>What&apos;s included</h3>
                <ul className="g-list">
                  {p.inc.map((x) => (
                    <li key={x}>✓ {x}</li>
                  ))}
                </ul>
              </>
            )}
          </GlassCard>
          <GlassCard as="section" rise={false} id="reviews">
            <h2>Reviews</h2>
            {reviews.length ? (
              <>
                <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
                  ★ {rating.avg.toFixed(1)} from {rating.count} verified {rating.count === 1 ? 'buyer' : 'buyers'}
                </p>
                {reviews.slice(0, 5).map((r) => (
                  <div key={r.orderId} className="g-li" style={{ display: 'block' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {'★'.repeat(r.rating)} <span className="g-muted">{r.who}</span>
                    </div>
                    <p className="g-muted" style={{ marginTop: 4, fontSize: 14 }}>
                      {r.body}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                No reviews yet. Only buyers who received this website can review it.
              </p>
            )}
          </GlassCard>
        </div>
        <div className="g-stack g-sticky">
          <GlassCard as="section" rise={false}>
            <h1>{p.name}</h1>
            {p.stack && <div className="g-tag">{p.stack}</div>}
            <div style={{ fontSize: 30, fontWeight: 300, marginTop: 10 }}>${p.price}</div>
            <div className="g-tag">Standard licence · one website, one domain · {deliveryText({ days: p.days, hours: p.hours })}</div>
            {beta && (
              <p style={{ marginTop: 10 }}>
                <StatusPill tone="info">Free during beta</StatusPill>
              </p>
            )}
            <div className="g-stack" style={{ marginTop: 14, gap: 8 }}>
              <Button href={`/checkout?id=${encodeURIComponent(p.id)}`}>{beta ? 'Request this website' : 'Buy with escrow'}</Button>
              {p.demo && (
                <Button variant="ghost" href={`/preview/${p.id}`} target="_blank" rel="noopener">
                  Open live demo
                </Button>
              )}
            </div>
            <p className="g-tag" style={{ marginTop: 10 }}>
              Extended licence and customization: {beta ? 'available after beta' : 'ask for a quotation'}. <Link href="/legal/licenses">Compare licences</Link>
            </p>
          </GlassCard>
          <GlassCard as="section" rise={false}>
            <h2>Buyer protection</h2>
            <ul className="g-list">
              <li>✓ Payment held in escrow until you approve</li>
              <li>✓ {REVIEW_HOURS} hours to review files and setup</li>
              <li>✓ {BUGFIX_DAYS}-day bug-fix guarantee after you accept</li>
              <li>✓ Domain registered in your own name</li>
            </ul>
          </GlassCard>
          {seller && (
            <GlassCard as="section" rise={false} className="g-row">
              <div>
                <h3>{seller.name}</h3>
                <div className="g-tag">
                  {seller.reviews > 0 ? `★ ${seller.rating.toFixed(1)} · ` : ''}
                  {seller.websites.length} {seller.websites.length === 1 ? 'website' : 'websites'}
                </div>
              </div>
              <Button variant="ghost" size="sm" href={`/sellers/${seller.handle}`}>
                Store
              </Button>
            </GlassCard>
          )}
        </div>
      </div>
      {related.length > 0 && (
        <section className="g-sec">
          <h2>More like this</h2>
          <div className="g-grid3" style={{ marginTop: 18 }}>
            {related.map((x) => (
              <WebsiteCard key={x.id} p={x} reveal />
            ))}
          </div>
        </section>
      )}
      {/* Search Console: Product data only where a real review exists, and no offers (decision O-11). */}
      {reviews.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.name,
            description: p.desc,
            url,
            aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.avg.toFixed(1), reviewCount: rating.count },
            review: reviews.slice(0, 5).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.who }, reviewRating: { '@type': 'Rating', ratingValue: r.rating }, reviewBody: r.body })),
          }}
        />
      )}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Websites', item: `${SITE_URL}/websites` },
            ...(hub ? [{ '@type': 'ListItem', position: 2, name: hub.name, item: SITE_URL + categoryPath(hub.slug) }] : []),
            { '@type': 'ListItem', position: hub ? 3 : 2, name: p.name, item: url },
          ],
        }}
      />
      <PageExtras path={listingPath(p.id)} urlPath={websitePath(p.id)} name={p.name} description={p.desc} defaultFaqs={productFaqs(p)} />
    </div>
  );
}
