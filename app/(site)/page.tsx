import type { Metadata } from 'next';
import { Fragment } from 'react';
import { arrangeSections, HOME_SECTIONS } from '@/lib/site/content';
import { homeSections } from '@/lib/site/contentStore';
import Image from 'next/image';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { AppArt } from '@/components/AppPhone';
import { SaveButton } from '@/components/SaveButton';
import { HeroDomain } from '@/components/HeroDomain';
import { LoopVideo } from '@/components/LoopVideo';
import { ScaledPage } from '@/components/ScaledPage';
import { StoreMotion } from '@/components/StoreMotion';
import { TemplatePage } from '@/components/TemplatePage';
import { Tilt } from '@/components/Tilt';
import { SHELVES, isApp, platformOf, shelfHref, shelfLabel, type AppPlatform, type Platform } from '@/lib/apps';
import { getLiveDbProducts } from '@/lib/catalog';
import { SHOW_LIST_PRICES } from '@/lib/config';
import { CONFIG, PAYOUT_HOLD_DAYS, REVIEW_HOURS, pct } from '@/lib/config';
import { daysLabel, imageFor, isNew, money, type Product } from '@/lib/data';
import { AREAS } from '@/lib/developers';
import { starterProducts } from '@/lib/examples';
import { legacyPublic } from '@/lib/legacy';
import { hubLinkHref } from '@/lib/seo/hubLinks';
import { allHubViews, allocation, hubProductPath } from '@/lib/seo/hubStore';
import { applyControls } from '@/lib/seo/applyControls';
import { pageControls } from '@/lib/seo/controlStore';
import { getSeo } from '@/lib/seo/site';

const HOME_DESCRIPTION = 'Websites, apps and digital products in one place. Look at the real thing before you pay; your money is held until you accept.';

/* The admin can set the title and description Google shows, and the Search Console and Bing codes, at /dashboard/admin/seo. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo();
  const description = seo.homeDescription || HOME_DESCRIPTION;
  return applyControls(
    '/',
    {
      ...(seo.homeTitle ? { title: { absolute: seo.homeTitle } } : {}),
      description,
      alternates: { canonical: '/' },
      openGraph: { description, ...(seo.homeTitle ? { title: seo.homeTitle } : {}) },
      verification: {
        ...(seo.googleVerification ? { google: seo.googleVerification } : {}),
        ...(seo.bingVerification ? { other: { 'msvalidate.01': seo.bingVerification } } : {}),
      },
    },
    await pageControls('/'),
  );
}
export const dynamic = 'force-dynamic';

const TABS = [
  ['popular', 'Popular'],
  ['new', 'New'],
  ['top', 'Top rated'],
] as const;
type Tab = (typeof TABS)[number][0];

/* The clip behind the hero: our own product pages drifting past in browser windows, rendered from
   scripts/hero-video-scene.html (see the note in scripts/hero-video-render.cjs). To use another clip, put it in
   public/video/ (short, silent, H.264, under ~5 MB) with a poster and change these two paths. */
const HERO_VIDEO = { src: '/video/marketplace-wall.mp4', poster: '/video/marketplace-wall-poster.webp' };

const SHELF_ORDER: Platform[] = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'];
const AREA_NOTE: Record<(typeof AREAS)[number], string> = {
  Websites: 'A new page, a booking form, your own words',
  'Web apps': 'Features, logins and dashboards',
  'Android apps': 'Your brand, store listing and updates',
  'iPhone & iPad apps': 'Rebrand, publish and keep it current',
  'Desktop apps': 'Installers and new features',
  'Online stores': 'Products, payments and shipping',
  'Bug fixes': 'Something broke? Get it fixed',
  'Customise a template': 'Make a bought site truly yours',
};

/* A small glyph per shelf and kind of work, drawn here so no brand logo is used. */
function Glyph({ k, size = 28 }: { k: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  switch (k) {
    case 'web':
    case 'Websites':
    case 'Customise a template':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
        </svg>
      );
    case 'android':
    case 'Android apps':
      // a phone with a download arrow: an app you install
      return (
        <svg {...p}>
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M12 7.5v6M9.5 11l2.5 2.5 2.5-2.5M10.5 18.5h3" />
        </svg>
      );
    case 'ios':
    case 'iPhone & iPad apps':
      // a phone beside a tablet
      return (
        <svg {...p}>
          <rect x="9" y="3" width="12" height="16" rx="2" />
          <rect x="3" y="8" width="7" height="13" rx="1.8" />
          <path d="M14 16.5h2M5.8 18.5h1.4" />
        </svg>
      );
    case 'webapp':
    case 'Web apps':
      // a browser window holding a dashboard
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 8.5h18M7 13h4v3H7zM14 12.5h3M14 15.5h3" />
        </svg>
      );
    case 'desktop':
    case 'Desktop apps':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      );
    case 'Online stores':
      return (
        <svg {...p}>
          <path d="M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0" />
        </svg>
      );
    case 'Bug fixes':
      return (
        <svg {...p}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
        </svg>
      );
    case 'dev':
      return (
        <svg {...p}>
          <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
        </svg>
      );
    case 'domains':
      // an address bar with "www"
      return (
        <svg {...p}>
          <rect x="2.5" y="7" width="19" height="10" rx="5" />
          <path d="M6 10.5l1 3 1-3 1 3 1-3M11.5 10.5l1 3 1-3 1 3 1-3M17 12h1.5" />
        </svg>
      );
    default:
      // a file with a download arrow: digital products
      return (
        <svg {...p}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
          <path d="M14 3v5h5M12 11v6M9.5 14.5L12 17l2.5-2.5" />
        </svg>
      );
  }
}

/* A big picture of the product, the same one the browse cards use: the site's own page, the app on a phone or in a window, or the files of a digital product. */
function Cover({ p, sizes = '(max-width: 640px) 100vw, 380px', badges = false }: { p: Product; sizes?: string; badges?: boolean }) {
  const app = isApp(p);
  const img = app ? undefined : imageFor(p.id);
  const shot = p.shots?.[0];
  const wide = app && SHELVES[platformOf(p) as AppPlatform].delivery !== 'store';
  return (
    <span
      className={'tc-shot ex-cover' + (app ? ' app-shot' : '') + (wide ? ' wide' : '')}
      style={app && p.app ? { background: `linear-gradient(165deg, ${p.app.accent}33, ${p.app.bg})` } : undefined}
    >
      {app ? (
        shot ? (
          <span className="ap-real">
            <Image src={shot} alt="" fill sizes="200px" unoptimized style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </span>
        ) : (
          <AppArt p={p} />
        )
      ) : shot ? (
        <Image className="tc-img" src={shot} alt="" fill sizes={sizes} unoptimized style={{ objectFit: 'cover', objectPosition: '50% 0%' }} />
      ) : img ? (
        <Image className="tc-img" src={img.src} alt="" fill sizes={sizes} style={{ objectFit: 'cover', objectPosition: '50% 0%' }} />
      ) : (
        <span className="tc-pan" aria-hidden="true">
          <ScaledPage>
            <TemplatePage p={p} />
          </ScaledPage>
        </span>
      )}
      {badges && <span className="ex-plat">{shelfLabel(platformOf(p))}</span>}
      {badges && (p.example ? <span className="ex-new ex-eg">Example</span> : isNew(p) && <span className="ex-new">New</span>)}
    </span>
  );
}

function Card({ p, href }: { p: Product; href?: string }) {
  return (
    <Tilt className="ex-tilt" max={6}>
      <div className="pwrap ex-card">
        <Link href={href ?? `/product/${p.id}`} className="ex-card-in">
          <Cover p={p} badges />
          <b className="ex-name">{p.name}</b>
          <span className="ex-sub">{p.tag}</span>
          <span className="ex-rate">
            {p.reviews > 0 ? (
              <>
                <span className="star">★</span> {p.rating} ({p.reviews})
              </>
            ) : (
              'No reviews yet'
            )}
          </span>
          <span className="ex-foot">
            {SHOW_LIST_PRICES && <span className="ex-price">{money(p.price)}</span>}
            <span className="chip">{daysLabel(p.days)}</span>
          </span>
        </Link>
        <SaveButton id={p.id} name={p.name} />
      </div>
    </Tilt>
  );
}

/* Shelves and categories with the most products, as collections of three pictures. */
type Collection = { key: string; title: string; href: string; items: Product[]; count: number };
function collections(all: Product[]): Collection[] {
  const by = new Map<string, Collection>();
  for (const p of all) {
    if (!p.cat) continue;
    const pl = platformOf(p);
    const key = `${pl}:${p.cat}`;
    const c = by.get(key) ?? {
      key,
      title: pl === 'web' ? `${p.cat} websites` : `${p.cat}: ${shelfLabel(pl).toLowerCase()}`,
      href: `${shelfHref(pl)}?cat=${encodeURIComponent(p.cat)}`,
      items: [],
      count: 0,
    };
    c.items.push(p);
    c.count++;
    by.set(key, c);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title)).slice(0, 6);
}

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab: Tab = TABS.find((t) => t[0] === asked)?.[0] ?? 'popular';
  const old = legacyPublic();
  const alloc = await allocation();
  const views = await allHubViews();
  const ecom = views.find((v) => v.hub.slug === 'ecommerce')!;
  const live = old ? (await Promise.all(SHELF_ORDER.map((pl) => getLiveDbProducts(pl)))).flat() : [];
  const ids = new Set(live.map((p) => p.id));
  // The public home is the E-commerce Templates page: its own products only. (A test server with the old public site keeps the old mix.)
  const all = old ? [...live, ...(await starterProducts()).filter((p) => !ids.has(p.id))] : ecom.products;
  const sorted = [...all].sort((a, b) => (tab === 'new' ? b.added.localeCompare(a.added) : tab === 'top' ? b.rating * Math.log(b.reviews + 2) - a.rating * Math.log(a.reviews + 2) : b.sold - a.sold));
  const featured = sorted.slice(0, 8);
  const sets = old ? collections(all) : views.map((v) => ({ key: v.hub.slug, title: v.hub.name, href: hubLinkHref(v.hub.slug), items: v.products, count: v.products.length }));
  const keep = (bps: number) => pct(10_000 - bps);

  // The built-in sections, drawn in the order an admin saved in Site builder (hidden ones left out; the top banner always stays).
  const parts: Record<string, React.ReactNode> = {
    hero: (
      <section className="mk-hero" aria-labelledby="mk-h1">
        <LoopVideo className="mk-hero-video" src={HERO_VIDEO.src} poster={HERO_VIDEO.poster} />
        <span className="mk-hero-shade" aria-hidden="true" />
        <div className="wrap mk-hero-in">
          <div className="mk-hero-copy">
            <h1 id="mk-h1">{old ? 'Websites, apps and digital products, ready to use' : 'Website templates, ready to make yours'}</h1>
            <p>
              {old
                ? 'Built once by real developers and made yours: your name, your domain, your store accounts. Look at the real thing before you pay.'
                : 'Built once by real developers and made yours: your name, your domain, your brand. Look at the real thing before you pay.'}
            </p>
            {sets.length > 0 && (
              <nav className="mk-hero-pop" aria-label="Popular right now">
                <span>Popular right now</span>
                <ul>
                  {sets.map((c) => (
                    <li key={c.key}>
                      <Link href={c.href}>
                        {c.title}
                        {c.count > 0 && <em>{c.count}</em>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <ul className="mk-hero-points">
              <li>Payment held in escrow until you accept</li>
              <li>{REVIEW_HOURS} hours to check it</li>
              <li>
                Live in {CONFIG.delivery.minDays} to {CONFIG.delivery.maxDays} days
              </li>
            </ul>
          </div>
          {old && <HeroDomain />}
        </div>
      </section>
    ),
    band: old ? (
      <section className="mk-band" aria-labelledby="mk-made">
        <div className="wrap">
          <div className="mk-head">
            <div>
              <h2 id="mk-made">Make it yours with a developer</h2>
              <p className="mk-sub">Fixed packages, a small paid trial, and the money held until you accept the work.</p>
            </div>
            <Link className="link-u" href="/developers">
              All developers
            </Link>
          </div>
          <div className="mk-row" data-rise>
            {AREAS.map((a) => (
              <Link key={a} className="mk-svc" href={`/developers?area=${encodeURIComponent(a)}`}>
                <span className="mk-svc-ico">
                  <Glyph k={a} size={24} />
                </span>
                <b>{a}</b>
                <small>{AREA_NOTE[a]}</small>
              </Link>
            ))}
          </div>
        </div>
      </section>
    ) : null,
    featured: (
      <section className="wrap mk-sec" aria-labelledby="ex-feat">
        <div className="mk-head">
          <h2 id="ex-feat">Featured products</h2>
          {old && (
            <Link className="link-u" href="/browse">
              Browse everything
            </Link>
          )}
        </div>
        <div className="ex-tabs" role="tablist" aria-label="Order">
          {TABS.map(([k, label]) => (
            <Link key={k} href={k === 'popular' ? '/' : `/?tab=${k}`} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : undefined} scroll={false}>
              {label}
            </Link>
          ))}
        </div>
        <div className="ex-grid mk-grid" data-rise>
          {featured.map((p) => (
            <Card key={p.id} p={p} href={old ? undefined : hubProductPath(ecom.hub, alloc, p.id)} />
          ))}
        </div>
      </section>
    ),
    why: (
      <section className="mk-why" aria-labelledby="mk-why-h">
        <div className="wrap">
          <h2 id="mk-why-h">Why people buy on SellOnBay</h2>
          <div className="mk-why-cols" data-rise>
            <div className="mk-why-col">
              <span className="mk-why-art" data-a="look" aria-hidden="true">
                <span className="mk-wa-win">
                  <span className="mk-wa-bar">
                    <i />
                    <i />
                    <i />
                    <span>yourname.com</span>
                  </span>
                  <span className="mk-wa-page">
                    <b />
                    <s />
                    <s />
                    <span className="mk-wa-live">Live demo</span>
                  </span>
                </span>
                <svg className="mk-wa-cursor" width="22" height="22" viewBox="0 0 24 24">
                  <path d="M5 3l14 8-6 1.5L10 19z" fill="#fff" stroke="#0F1330" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </span>
              <h3>Look before you pay</h3>
              <p>Click through the live site or try the app first. What you see is what the seller delivers.</p>
            </div>
            <div className="mk-why-col">
              <span className="mk-why-art" data-a="hold" aria-hidden="true">
                <span className="mk-wa-flow">
                  <span className="mk-wa-node">
                    <i>1</i>
                    You pay
                  </span>
                  <span className="mk-wa-node mk-wa-lock">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    Held safely
                  </span>
                  <span className="mk-wa-node">
                    <i>3</i>
                    You accept
                  </span>
                </span>
              </span>
              <h3>Your money waits for you</h3>
              <p>Payment stays in escrow. You get {REVIEW_HOURS} hours to check the work, and a fair dispute if something is wrong.</p>
            </div>
            <div className="mk-why-col">
              <span className="mk-why-art" data-a="yours" aria-hidden="true">
                <span className="mk-wa-domain">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                  yourshop.com
                </span>
                <span className="mk-wa-owner">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                  Registered to you
                </span>
              </span>
              <h3>Made to be yours</h3>
              <p>Domains and store accounts are in your name. Need changes? Order them from the seller or hire a developer.</p>
            </div>
          </div>
        </div>
      </section>
    ),
    steps: (
      <section className="wrap mk-sec" aria-labelledby="mk-steps">
        <h2 id="mk-steps" className="mk-steps-h">
          How a purchase goes
        </h2>
        <ol className="mk-steps" data-rise>
          <li>
            <b>Pick it</b>
            <span>Find a site, app or file and look at the live demo.</span>
          </li>
          <li>
            <b>Pay into escrow</b>
            <span>Your money is held. The seller cannot touch it yet.</span>
          </li>
          <li>
            <b>Get it delivered</b>
            <span>
              Live on your domain or accounts in {CONFIG.delivery.minDays} to {CONFIG.delivery.maxDays} days. Files arrive at once.
            </span>
          </li>
          <li>
            <b>Check and accept</b>
            <span>
              You have {REVIEW_HOURS} hours. The seller is paid {PAYOUT_HOLD_DAYS} days after you accept.
            </span>
          </li>
        </ol>
      </section>
    ),
    sell: (
      <section className="mk-sellband" aria-labelledby="mk-sell-h">
        <div className="wrap mk-sellband-in">
          <div>
            <h2 id="mk-sell-h">Build once, sell it again and again</h2>
            <p>
              Upload a site, app or digital product once and deliver it to many buyers. You keep {keep(CONFIG.fees.saleBps)} of every sale from ${CONFIG.fees.saleLowBelowCents / 100} and{' '}
              {keep(CONFIG.fees.saleLowBps)} below it; custom and extra work keep {keep(CONFIG.fees.customBps)}.
            </p>
          </div>
          <div className="mk-sellband-cta">
            <Link className="btn btn-gold btn-lg" href="/sell">
              Start selling
            </Link>
            {old && (
              <Link className="btn btn-line btn-lg" href="/developers/join">
                Join as a developer
              </Link>
            )}
          </div>
        </div>
      </section>
    ),
  };
  const sections = arrangeSections(
    HOME_SECTIONS.map(([k]) => k),
    await homeSections(),
  );

  return (
    <div className="mk-home">
      <StoreMotion />
      {sections.map((k) => (
        <Fragment key={k}>{parts[k]}</Fragment>
      ))}
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL }} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL,
          potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
        }}
      />
      <PageExtras path="/" name="SellOnBay" />
    </div>
  );
}
