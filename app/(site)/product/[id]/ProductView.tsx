import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppPreview } from '@/components/AppPreview';
import { PlatformBadge } from '@/components/PlatformBadge';
import { PreviewFrame } from '@/components/PreviewFrame';
import { TallCard } from '@/components/TallCard';
import { TrackView } from '@/components/TrackView';
import { AskSeller } from '@/components/AskSeller';
import { TrialCopy } from '@/components/TrialCopy';
import { BUGFIX_DAYS, PAYOUT_HOLD_DAYS, REVIEW_HOURS } from '@/lib/config';
import { flags } from '@/lib/flags';
import { JsonLd } from '@/components/JsonLd';
import { ratingOf, reviewsFor } from '@/lib/reviews';
import { SITE_URL } from '@/lib/site';
import { deliveryTypeOf, licenceOf, thirdPartyOf } from '@/lib/handover';
import { LICENCES, copyleftNote } from '@/lib/licences';
import { infoOf, periodText } from '@/lib/productInfo';
import { versionsOf } from '@/lib/versions';
import { BuyBox } from '@/components/BuyBox';
import { EXAMPLE_NOTE, examplesBuyable, starterProducts } from '@/lib/examples';
import { clientIp } from '@/lib/delivery/service';
import { questionsForBuyer } from '@/lib/presale/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId } from '@/lib/supabase/viewer';
import { headers } from 'next/headers';
import { deliveryOf, platformOf, shelfHref, shelfLabel, storeOf } from '@/lib/apps';
import { getLiveDbProducts, visibleProduct } from '@/lib/catalog';
import { PageExtras } from '@/components/PageExtras';
import { legacyPublic } from '@/lib/legacy';
import { allHubViews, allocation, hubProductPath } from '@/lib/seo/hubStore';
import { productFaqs } from '@/lib/seo/productFaq';
import { isPublic } from '@/lib/seo/controls';
import { pageControls } from '@/lib/seo/controlStore';
import { listingMetadata, listingPath } from '@/lib/seo/listingMeta';
import { allPageSeo } from '@/lib/seo/pageMeta';

export type ProductViewProps = {
  id: string;
  /* the public address (/templates/<category>/<product>) */ canonical?: string;
  /* breadcrumb trail above the product */ crumbs?: { name: string; url: string }[];
};

/* The product page itself. It is shown at /templates/<category>/<product> (templates/[category]/[slug]/page.tsx); a listing's page settings stay keyed by /product/<id>. */
export async function productMetadata(id: string, canonical?: string): Promise<Metadata> {
  const found = await visibleProduct(id);
  if (!found) return { title: 'Not found', robots: { index: false } };
  const ctl = await pageControls(listingPath(found.product.id));
  if (found.status === 'live' && !isPublic(listingPath(found.product.id), ctl)) return { title: 'Not found', robots: { index: false } };
  const m = listingMetadata(found.product, found.status, (await allPageSeo())[listingPath(found.product.id)], ctl);
  return canonical && !ctl.canonical ? { ...m, alternates: { ...m.alternates, canonical } } : m;
}

export default async function ProductView({ id, canonical, crumbs }: ProductViewProps) {
  const found = await visibleProduct(id);
  if (!found) notFound();
  // An admin can unpublish a listing's page: a real 404, while its orders, downloads and licences keep working through the order pages.
  if (found.status === 'live' && !isPublic(listingPath(found.product.id), await pageControls(listingPath(found.product.id)))) notFound();
  const p = found.product;
  const pl = platformOf(p);
  const app = pl !== 'web';
  const dv = deliveryOf(p);
  const store = storeOf(p);
  // Who is asking: the signed-in person, or in demo mode (no accounts) a stand-in made from the connection.
  const viewerId = await getViewerId();
  const askerId = viewerId ?? (supabaseConfigured ? null : `demo:${clientIp({ headers: await headers() } as Request)}`);
  const asker = { signedIn: !!askerId, history: askerId ? (await questionsForBuyer(askerId, p.id)).map((q) => ({ id: q.id, body: q.body, reply: q.reply, created_at: q.created_at })) : [] };

  // Related products come from the same category pages the visitor can open (the five template categories); the old shelves are retired.
  const hubRows = legacyPublic() ? [] : (await allHubViews()).flatMap((v) => v.products.map((x) => ({ x, hub: v.hub })));
  const alloc = legacyPublic() ? undefined : await allocation();
  const pool = (legacyPublic() ? [...(await starterProducts()), ...(await getLiveDbProducts(pl))] : hubRows.map((r) => r.x)).filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  const hrefOf = (id: string) => {
    const r = hubRows.find((h) => h.x.id === id);
    return r && alloc ? hubProductPath(r.hub, alloc, id) : `/product/${id}`;
  };
  const same = legacyPublic() ? pool.filter((x) => platformOf(x) === pl) : pool;
  const mine = pool.filter((x) => x.seller === p.seller);
  const totalSold = mine.reduce((n, x) => n + x.sold, 0);
  const more = [...same.filter((x) => x.id !== p.id && x.cat === p.cat), ...same.filter((x) => x.id !== p.id && x.cat !== p.cat)].slice(0, 3);
  const info = infoOf(p);
  const newer = info ? (await versionsOf(p.id, 'live')).slice(0, 5) : [];
  const lic = licenceOf(p),
    third = thirdPartyOf(p),
    copyleft = copyleftNote(third),
    repo = deliveryTypeOf(p) === 'repo_access';
  // Real reviews replace the made-up starter ratings as soon as there is one. Structured data only ever uses real reviews.
  const real = await ratingOf(p.id);
  const realReviews = await reviewsFor(p.id, 10);
  const shownCount = real.count || p.reviews;
  const shownRating = real.count ? real.avg : p.rating;
  const self = SITE_URL + (canonical ?? `/product/${p.id}`);
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.desc,
    category: p.cat,
    url: self,
    // An example that cannot be bought is not offered to search engines (a Product claim we could not keep).
    ...(p.example && !examplesBuyable() ? {} : { offers: { '@type': 'Offer', price: p.price, priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: self } }),
    ...(real.count > 0
      ? {
          aggregateRating: { '@type': 'AggregateRating', ratingValue: real.avg, reviewCount: real.count, bestRating: 5, worstRating: 1 },
          review: realReviews.map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: r.who },
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            ...(r.body ? { reviewBody: r.body } : {}),
          })),
        }
      : {}),
  };
  const shelf = { href: shelfHref(pl), label: pl === 'web' ? 'Browse sites' : shelfLabel(pl) };

  return (
    <div className="wrap" data-pdp>
      <JsonLd data={jsonLd} />
      {crumbs && crumbs.length > 0 && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [...crumbs, { name: p.name, url: self }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
          }}
        />
      )}
      <div className="crumbs">
        <Link href={shelf.href}>{shelf.label}</Link> / <span>{p.name}</span>
      </div>
      <div className="pd-head">
        <span className="pd-chips">
          <span className="chip blue">{p.cat}</span>
          <PlatformBadge p={p} className="app-badge static" />
        </span>
        <h1>{p.name}</h1>
        <div className="muted pd-meta">
          {p.example && (
            <span className="chip amber" data-example>
              <i />
              Example listing
            </span>
          )}
          {shownCount > 0 ? (
            <span>
              <span className="star">★</span> {shownRating} ({shownCount} {shownCount === 1 ? 'review' : 'reviews'})
            </span>
          ) : (
            <span>No reviews yet</span>
          )}
          {!p.example && (
            <>
              <span>{p.sold} sold</span>
              <span>
                by <b>{p.seller}</b>
              </span>
            </>
          )}
        </div>
      </div>
      {app ? <AppPreview p={p} /> : <PreviewFrame p={p} />}
      {!app && p.shots && p.shots.length > 0 && (
        <div className="shot-prev" aria-label="Pictures of the site">
          {p.shots.map((s) => (
            <a key={s} href={s} target="_blank" rel="noopener noreferrer" style={{ backgroundImage: `url(${s})` }} aria-label="Open picture" />
          ))}
        </div>
      )}
      <TrackView id={p.id} />
      <div className="pdp">
        <div>
          <p style={{ fontSize: '1.15rem', marginTop: 18, maxWidth: '58ch' }}>{p.desc}</p>
          <div className="tags">
            {[p.tag, p.cat, ...(app && p.stack ? [`Built with ${p.stack}`] : ['Built with AI']), 'Checked by SellOnBay'].map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
          <h2>What you get</h2>
          <ul className="checks">
            {p.inc.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          {info && (
            <>
              <h2>Good to know</h2>
              <dl className="facts-list" data-info>
                <div>
                  <dt>What it needs</dt>
                  <dd>{info.requirements || 'The seller has not listed any special requirements.'}</dd>
                </div>
                <div>
                  <dt>Documentation</dt>
                  <dd>
                    {info.docsUrl ? (
                      <a className="link-u" href={info.docsUrl} target="_blank" rel="noopener noreferrer nofollow">
                        Read the guide
                      </a>
                    ) : (
                      'No separate guide.'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Support from the seller</dt>
                  <dd>{info.supportDays > 0 ? `${periodText(info.supportDays)} from your purchase, in the order chat` : 'None. You get the product as it is.'}</dd>
                </div>
                <div>
                  <dt>Updates</dt>
                  <dd>{info.updateDays > 0 ? `New versions for ${periodText(info.updateDays)} from your purchase` : 'None. You get the version you buy.'}</dd>
                </div>
              </dl>
              {newer.length > 0 && (
                <>
                  <h2>What&apos;s new</h2>
                  <ul className="checks" data-versions>
                    {newer.map((v) => (
                      <li key={v.id}>
                        <b>{v.version}.</b> {v.changelog}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <h2>Licence</h2>
          <p>
            <b>{LICENCES[lic].label}.</b> {LICENCES[lic].terms}
          </p>
          {third.length > 0 && (
            <ul className="checks">
              {third.map((t) => (
                <li key={t.name}>
                  Includes {t.name} ({t.licence})
                </li>
              ))}
            </ul>
          )}
          {copyleft && (
            <p className="trialbox" role="note">
              {copyleft}
            </p>
          )}
          {repo && (
            <p>You get this as an invite to a private GitHub repository. After you pay, the seller invites your GitHub account and you confirm you can open it. Then your review time starts.</p>
          )}
          {dv === 'download' && (
            <>
              <h2>Your protection</h2>
              <ul className="prot">
                <li>
                  <b>Escrow.</b> Your money is held until you accept. The seller is only paid after that.
                </li>
                <li>
                  <b>Check before you commit.</b> You have {REVIEW_HOURS} hours with the files, and you can ask the seller anything first.
                </li>
                <li>
                  <b>Fair disputes.</b> Not as described, does not work, or harmful code? The seller gets a chance to fix it, and if they cannot, you are refunded.
                </li>
                <li>
                  <b>Real demos.</b> Sellers must show scripts, plugins, automations and chatbots working before they are listed.
                </li>
              </ul>
            </>
          )}
          {flags.trialCopy && p.trial && pl === 'digital' && (
            <>
              <h2>Try before you buy</h2>
              <TrialCopy slug={p.id} signedIn={asker.signedIn} />
            </>
          )}
          <h2>Ask the seller a question</h2>
          <AskSeller productKey={p.id} signedIn={asker.signedIn} history={asker.history} />
          <h2>Reviews</h2>
          {realReviews.length === 0 ? (
            <p className="muted">No reviews from buyers yet. Only people who bought and accepted it can review.</p>
          ) : (
            <ul className="reviews">
              {realReviews.map((r) => (
                <li key={r.orderId}>
                  <b>
                    <span className="star">★</span> {r.rating}
                  </b>{' '}
                  <span className="muted">{r.who}</span>
                  {r.body && <p>{r.body}</p>}
                </li>
              ))}
            </ul>
          )}
          <h2>About the seller</h2>
          {p.example ? (
            <p className="muted" style={{ maxWidth: '60ch' }}>
              {EXAMPLE_NOTE} Real listings show their seller here, with their listings and sales.
            </p>
          ) : (
            <div className="seller-card">
              <span className="av">{p.seller[0]}</span>
              <div>
                <b>{p.seller}</b>
                <div className="stats">
                  <span>
                    {mine.length} {mine.length === 1 ? 'listing' : 'listings'}
                  </span>
                  <span>{totalSold} sold</span>
                  <span>Checked by SellOnBay</span>
                </div>
              </div>
            </div>
          )}
          <h2>Good to know</h2>
          <ul className="checks">
            <li>Payment is held until you accept</li>
            {dv === 'store' ? (
              <>
                <li>It is published under your own {store} account</li>
                <li>You need your own developer account ({pl === 'ios' ? 'Apple' : 'Google'} charges its own fee)</li>
                <li>{store} decides when the app is approved</li>
                <li>Personal license: publish it as your own app</li>
              </>
            ) : dv === 'installer' ? (
              <>
                <li>You get installers for the computers you choose</li>
                <li>Signing certificates are yours, with their own fees</li>
                <li>No store needed: share the installer anywhere</li>
                <li>Personal license: ship it as your own app</li>
              </>
            ) : dv === 'download' ? (
              <>
                <li>You get the files as soon as your payment is held in escrow</li>
                <li>No domain needed: you use it where you work</li>
                <li>If it is not as described or has harmful code, you can dispute it while you check it or in the {BUGFIX_DAYS} days after you accept</li>
                <li>Personal or business use for you, no reselling</li>
              </>
            ) : dv === 'host' ? (
              <>
                <li>It is deployed on your own domain</li>
                <li>Hosting is yours, or an optional extra from us</li>
                <li>You own the data and the accounts it creates</li>
                <li>Personal license: run it as your own product</li>
              </>
            ) : (
              <>
                <li>Domain is registered in your name</li>
                <li>Domain and hosting are optional extras</li>
                <li>Personal license: use it on your own domain</li>
                <li>Source files come with the order</li>
              </>
            )}
          </ul>
          <h2>How delivery works</h2>
          <p className="muted" style={{ maxWidth: '60ch' }}>
            {dv === 'store'
              ? `After you pay, the seller rebrands the app and sends you a test build (${pl === 'ios' ? 'through TestFlight' : 'an install link for your phone'}). You have 48 hours to try it. Your source files are ready to download as soon as you pay, and your payment stays with SellOnBay until you accept. Then the seller submits it to ${store} from your account.`
              : dv === 'installer'
                ? 'After you pay, the seller rebrands the app and sends you installers to try on your own computer. You have 48 hours to try them. Your source files are ready to download as soon as you pay, and your payment stays with SellOnBay until you accept.'
                : dv === 'download'
                  ? `After you pay, your files are ready at once through a secure link that lasts 24 hours (you can get a new one any time) with your own licence key. You have ${REVIEW_HOURS} hours to check them, and your payment stays with SellOnBay until you accept. Accept, or open a dispute (not as described, does not work, harmful code). If you do nothing, it is accepted after ${REVIEW_HOURS} hours. The seller is paid ${PAYOUT_HOLD_DAYS} days after acceptance. If you picked setup help or customisation, the seller works on it first.`
                  : dv === 'host'
                    ? 'After you pay, the seller rebrands the app, deploys it on your domain and sends you a private test link. You have 48 hours to try it. Your source files are ready to download as soon as you pay, and your payment stays with SellOnBay until you accept.'
                    : 'After you pay, the seller sets the site up on your domain and sends it for review. You have 48 hours to check the live site. Your source files are ready to download as soon as you pay, and your payment stays with SellOnBay until you accept.'}
          </p>
        </div>
        <BuyBox p={p} locked={p.example && !examplesBuyable() ? EXAMPLE_NOTE : ''} />
      </div>
      {more.length > 0 && (
        <div style={{ paddingBottom: 88 }}>
          <div className="sec-head">
            <h2>More you might like</h2>
          </div>
          <div className="grid tall-grid">
            {more.map((x) => (
              <TallCard key={x.id} p={x} href={hrefOf(x.id)} />
            ))}
          </div>
        </div>
      )}
      <PageExtras path={listingPath(p.id)} name={p.name} description={p.desc} defaultFaqs={productFaqs(p)} />
    </div>
  );
}
