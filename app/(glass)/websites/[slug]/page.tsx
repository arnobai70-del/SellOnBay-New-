import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { publicSlug } from '@/lib/glass/publicSlug';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { TrackView } from '@/components/TrackView';
import { PriceTag } from '@/components/glass/PriceTag';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { ShotGallery } from '@/components/glass/ShotGallery';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { betaEligible } from '@/lib/beta/rules';
import { visibleProduct } from '@/lib/catalog';
import { BUGFIX_DAYS, REVIEW_HOURS } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { localizedPath } from '@/lib/i18n/config';
import { getI18n } from '@/lib/i18n/server';
import { alternateLanguages } from '@/lib/i18n/seo';
import { pkgOffered } from '@/lib/data';
import { deliveryText } from '@/lib/deliveryTime';
import { examplesBuyable } from '@/lib/examples';
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

import { T } from '@/components/i18n/T';
/* A listing in review is private, so this page renders per request. Its page settings stay keyed by /product/<id>, where an admin saved them. */
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

async function find(slug: string) {
  // The clean address (no "template", lib/glass/publicSlug.ts) is looked up among the live websites; the database slug still works too.
  const id = (await publicWebsites()).find((w) => publicSlug(w.id) === slug && w.id !== slug)?.id ?? slug;
  const found = await visibleProduct(id);
  if (!found) return null;
  const ctl = await pageControls(listingPath(found.product.id));
  if (found.status === 'live' && !isPublic(listingPath(found.product.id), ctl)) return null;
  return { ...found, product: publicListing(found.product), ctl };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = await find(slug);
  if (!f) return { title: 'Not found', robots: { index: false } };
  // In another language (lib/i18n): the listing's translated name, description and SEO words, its own address and the other languages.
  const i = await getI18n();
  const id = f.product.id;
  const product = { ...f.product, name: i.pick(`product.${id}.name`, f.product.name), desc: i.pick(`product.${id}.description`, f.product.desc) };
  const m = listingMetadata(product, f.status, (await allPageSeo())[listingPath(id)], f.ctl);
  const canonical = localizedPath(websitePath(id), i.lang);
  const languages = alternateLanguages(websitePath(id), i.languages);
  const seo =
    i.lang === 'en' ? {} : { title: i.pick(`product.${id}.seoTitle`, String(m.title ?? product.name)), description: i.pick(`product.${id}.seoDescription`, String(m.description ?? product.desc)) };
  return f.ctl.canonical && i.lang === 'en'
    ? { ...m, alternates: { ...m.alternates, languages } }
    : { ...m, ...seo, alternates: { ...m.alternates, canonical, languages }, openGraph: { ...m.openGraph, ...seo, url: canonical, locale: i.lang } };
}

const TINTS = ['#D3EEE4', '#DDEAF6', '#E6E2F4', '#F1E8DD'];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'S';
const SHIELD = 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z';

/*
 * design-reference/website.html: the screenshots, overview, what is included, a domain and customization, reviews, and the buy box with the two
 * licences (owner, 2026-11-09: Standard is one end website for you or one client; Extended by quotation), buyer protection and the seller.
 * In the free beta the button asks for the website (the cart); with live payments it buys into escrow (checkout).
 */
export default async function Website({ params }: Props) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const { slug } = await params;
  const f = await find(slug);
  if (!f) notFound();
  const i18n = await getI18n();
  if (publicSlug(f.product.id) !== slug) permanentRedirect(localizedPath(websitePath(f.product.id), i18n.lang)); // an old address with "template" in it
  const p = { ...f.product, name: i18n.pick(`product.${f.product.id}.name`, f.product.name), desc: i18n.pick(`product.${f.product.id}.description`, f.product.desc) }; // translated words (lib/i18n)
  const [cats, reviews, rating, settings, sites, sellers, copy] = await Promise.all([
    websiteCategories(),
    reviewsFor(p.id),
    ratingOf(p.id),
    getSettings(),
    publicWebsites(),
    publicSellers(),
    pageCopy('website'),
  ]);
  const hub = cats.of(p);
  const url = SITE_URL + websitePath(p.id);
  const seller = sellers.find((s) => s.websites.some((w) => w.id === p.id));
  const related = sites.filter((x) => x.id !== p.id && hub && cats.of(x)?.slug === hub.slug).slice(0, 3);
  const beta = settings.paymentsMode === 'beta_free';
  const requestable = p.sellerId ? betaEligible(p) : examplesBuyable();
  const live = sites.find((x) => x.id === p.id) ?? p;
  const tint = TINTS[[...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  const custom = pkgOffered(p, 'custom');
  return (
    <PublicFrame file="website">
      <TrackView id={p.id} />
      <div className="muted" style={{ fontSize: 13, padding: '32px 0 20px' }}>
        <Link href="/websites" style={{ color: '#566C78' }} prefetch={false}>
          <T s={'Websites'} />
        </Link>
        {hub && (
          <>
            {' / '}
            <Link href={categoryPath(hub.slug)} style={{ color: '#566C78' }} prefetch={false}>
              {hub.name.replace(/ Websites$/, '')}
            </Link>
          </>
        )}
        {' / '}
        <span style={{ color: '#2B4250' }}>{p.name}</span>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ShotGallery shots={p.shots ?? []} name={p.name} tint={tint} />
          <div style={{ marginTop: 18, borderBottom: '1px solid #D9E5EB' }} role="tablist" aria-label={tx('About this website')}>
            <a className="tab on" href="#overview" role="tab">
              <T s={'Overview'} />
            </a>
            <a className="tab" href="#features" role="tab">
              <T s={'Features'} />
            </a>
            <a className="tab" href="#reviews" role="tab">
              <T s={'Reviews'} />
            </a>
          </div>
          <div id="overview" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65 }}>{p.desc}</p>
            {p.does && p.does.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 10 }}>
                {p.does.map((x) => (
                  <div key={x} className="li">
                    <span aria-hidden="true">✓</span> {x}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div id="features" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14, marginTop: 10 }}>
            <div className="glass" style={{ padding: 22 }}>
              <div style={{ fontSize: 17, marginBottom: 10 }}>{copy.t('labels', 'included')}</div>
              {(p.inc.length ? p.inc : ['Source files', 'Setup guide']).map((x, i, a) => (
                <div key={x} className="li" style={i < a.length - 1 ? { marginBottom: 8 } : undefined}>
                  <span aria-hidden="true">✓</span> {x}
                </div>
              ))}
            </div>
            <div className="glass" style={{ padding: 22 }}>
              <div style={{ fontSize: 17, marginBottom: 10 }}>
                <T s={'To run it you need'} />
              </div>
              {[p.stack ? `Hosting that runs ${p.stack}` : 'Hosting for the website', 'Or ask the seller for setup help when you order', 'A domain (you can add one below)'].map((x, i, a) => (
                <div key={x} className="li" style={i < a.length - 1 ? { marginBottom: 8 } : undefined}>
                  <span aria-hidden="true">·</span> {x}
                </div>
              ))}
            </div>
          </div>
          <div
            className="glass"
            style={{ marginTop: 4, padding: '20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderColor: '#CFE9DF' }}
          >
            <div>
              <div style={{ fontSize: 17 }}>
                <T s={'Add a domain'} />
              </div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                <T s={'Registered in your own name and connected to this website for you'} />
              </div>
            </div>
            <Link className="btn" href="/domains" prefetch={false}>
              <T s={'Find a domain'} />
            </Link>
          </div>
          <div className="glass" style={{ marginTop: 4, padding: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 17 }}>
                <T s={'Need this website customized?'} />
              </div>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                {beta ? 'Paid custom work is available after the beta.' : 'Work with the seller, paid through escrow.'}
              </div>
            </div>
            {!beta && custom ? (
              <Link className="btn" href={`/checkout?id=${encodeURIComponent(p.id)}&pkg=custom`} prefetch={false}>
                <T s={'Request customization'} />
              </Link>
            ) : seller ? (
              <Link className="btn ghost" href={`/sellers/${seller.handle}`} prefetch={false}>
                <T s={"Seller's store"} />
              </Link>
            ) : null}
          </div>
          <section id="reviews" className="glass" style={{ padding: 22, marginTop: 4 }}>
            <div style={{ fontSize: 17, marginBottom: 6 }}>
              <T s={'Reviews'} />
            </div>
            {reviews.length ? (
              <>
                <div className="muted" style={{ fontSize: 14 }}>
                  <T s={'★ {v0} from {count} verified {v2}'} v={{ v0: rating.avg.toFixed(1), count: rating.count, v2: rating.count === 1 ? 'buyer' : 'buyers' }} />
                </div>
                {reviews.slice(0, 5).map((r) => (
                  <div key={r.orderId} className="li" style={{ display: 'block' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {'★'.repeat(r.rating)} <span className="muted">{r.who}</span>
                    </div>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
                      {r.body}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                <T s={'No reviews yet. Only buyers who received this website can review it.'} />
              </p>
            )}
          </section>
        </div>
        <aside style={{ flex: '1 1 320px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="glass" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h1 style={{ fontSize: 26 }}>{p.name}</h1>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                {[p.stack, seller ? `by ${seller.name}` : null, deliveryText({ days: p.days, hours: p.hours })].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 300 }}>
              <PriceTag p={live} big />
            </div>
            {beta && requestable && (
              <span className="status st-info" style={{ alignSelf: 'flex-start' }}>
                <T s={'Free during beta'} />
              </span>
            )}
            <div className="lic on" role="radio" aria-checked="true">
              <span>
                <span style={{ display: 'block', fontWeight: 500 }}>
                  <T s={'Standard'} />
                </span>
                <span className="tag" style={{ display: 'block' }}>
                  <T s={'One end website, for you or one client'} />
                </span>
              </span>
              <span>${p.price}</span>
            </div>{' '}
            <Link className="lic" href="/legal/licenses" prefetch={false} role="radio" aria-checked="false">
              <span>
                <span style={{ display: 'block', fontWeight: 500 }}>
                  <T s={'Extended'} />
                </span>
                <span className="tag" style={{ display: 'block' }}>
                  <T s={'Several clients, resale or SaaS'} />
                </span>
              </span>
              <span className="tag" style={{ margin: 0 }}>
                {beta ? 'After beta' : 'Quotation'}
              </span>
            </Link>{' '}
            {p.demo && (
              <Link className="btn ghost full" href={`/preview/${p.id}`} target="_blank" rel="noopener">
                {copy.t('labels', 'demo')}
              </Link>
            )}{' '}
            <Link href="/legal/licenses" style={{ fontSize: 13, textAlign: 'center' }} prefetch={false}>
              <T s={'Compare licenses'} />
            </Link>{' '}
            {!beta ? (
              <Link className="btn full" href={`/checkout?id=${encodeURIComponent(p.id)}`}>
                <T s={'Buy with escrow'} />
              </Link>
            ) : requestable ? (
              <Link className="btn full" href={`/cart?add=${encodeURIComponent(p.id)}`}>
                {copy.t('labels', 'cart')}
              </Link>
            ) : (
              <button className="btn full" type="button" disabled>
                {copy.t('labels', 'after')}
              </button>
            )}
            <div className="tag" style={{ textAlign: 'center' }}>
              <T s={'One-time purchase · Seller paid after your approval'} />
            </div>
          </div>
          <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 500 }}>
              <T s={'Buyer protection'} />
            </div>
            <div className="li">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="1.8" aria-hidden="true">
                <path d={SHIELD} />
              </svg>
              <T s={'Payment held in escrow until you approve'} />
            </div>
            <div className="li">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <T s={'{REVIEW_HOURS} hours to review files and setup, then a {BUGFIX_DAYS}-day bug-fix guarantee'} v={{ REVIEW_HOURS, BUGFIX_DAYS }} />
            </div>
            <div className="li">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
              </svg>
              <T s={'Domain registered in your own name'} />
            </div>
          </div>
          {seller && (
            <div className="glass" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="avatar" style={{ background: '#E6E2F4' }} aria-hidden="true">
                {initials(seller.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{seller.name}</div>
                <div className="tag">
                  {seller.reviews > 0 ? `★ ${seller.rating.toFixed(1)} · ` : ''}
                  {seller.websites.length} {seller.websites.length === 1 ? 'website' : 'websites'}
                  {seller.replyTime ? ` · ${seller.replyTime}` : ''}
                </div>
              </div>
              <Link className="btn ghost" href={`/sellers/${seller.handle}`} style={{ padding: '0 16px' }} prefetch={false}>
                <T s={'Store'} />
              </Link>
            </div>
          )}
        </aside>
      </div>
      {related.length > 0 && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>
            <T s={'More like this'} />
          </h2>
          <div className="grid3">
            {related.map((x) => (
              <WebsiteCard key={x.id} p={x} />
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
    </PublicFrame>
  );
}
