import type { Metadata } from 'next';
import { Fragment } from 'react';
import { arrangeSections, HOME_SECTIONS } from '@/lib/site/content';
import { homeSections } from '@/lib/site/contentStore';
import Image from 'next/image';
import Link from 'next/link';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { HeroDomain } from '@/components/HeroDomain';
import { Cover, HomeCard } from '@/components/home/HomeCard';
import { FeaturedTabs } from '@/components/home/FeaturedTabs';
import { HeroVideo } from '@/components/home/HeroVideo';
import { HomeMotion } from '@/components/home/HomeMotion';
import { RailControls } from '@/components/home/RailControls';
import { serif } from '@/components/home/serif';
import { platformOf, shelfHref, shelfLabel, type Platform } from '@/lib/apps';
import { getLiveDbProducts } from '@/lib/catalog';
import { CONFIG, PAYOUT_HOLD_DAYS, PLAN_KEEP_TEXT, REVIEW_HOURS, pct } from '@/lib/config';
import { type Product } from '@/lib/data';
import { AREAS } from '@/lib/developers';
import { starterProducts } from '@/lib/examples';
import { legacyPublic } from '@/lib/legacy';
import { hubLinkHref } from '@/lib/seo/hubLinks';
import { allHubViews, allocation, hubProductPath } from '@/lib/seo/hubStore';
import { applyControls } from '@/lib/seo/applyControls';
import { pageControls } from '@/lib/seo/controlStore';
import { getSeo } from '@/lib/seo/site';
import '../home.css';

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

/* The still behind the hero (WebP, under 60 KB), shown first and kept as the LCP picture, preloaded (Next 16's name for priority); the clip itself (components/home/HeroVideo.tsx) comes in after the page has
   loaded. Both live in public/media/. */
const HERO_POSTER = '/media/hero-poster.webp';
// The glow behind each "Popular right now" panel, in category order.
const PANEL_TINTS = ['#3B5BFF', '#6C4CF5', '#0E8C7A', '#E0A21E', '#C2532E'];

/* The small label above a section heading (labels approved by the owner, 2026-10-29), the same pill everywhere. */
function Kick({ children }: { children: React.ReactNode }) {
  return (
    <span className="kick">
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

/* A small padlock, as in an address bar. */
function Lock({ dark = false }: { dark?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dark ? '#1A1405' : '#12A37A'} strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

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
  // Featured Products shows every product across all template hubs so sellers see their
  // listings on the home page regardless of which category they used.
  // Legacy test servers keep the old all-shelves mix.
  const allHubProducts = views.flatMap((v) => v.products);
  const _seenFeat = new Set<string>();
  const all = old
    ? [...live, ...(await starterProducts()).filter((p) => !ids.has(p.id))]
    : allHubProducts.filter((p) => {
        if (_seenFeat.has(p.id)) return false;
        _seenFeat.add(p.id);
        return true;
      });
  // Build a map from product id → its hub so each card links to the right category page.
  const productHub = new Map<string, (typeof views)[number]['hub']>();
  if (!old)
    views.forEach((v) =>
      v.products.forEach((p) => {
        if (!productHub.has(p.id)) productHub.set(p.id, v.hub);
      }),
    );
  // Popular tab: real sales + a temporary lift for products added in the last 30 days,
  // so newly uploaded listings appear prominently before they have any sales of their own.
  const NEW_BOOST_DAYS = 30;
  const NEW_BOOST_SCORE = 50; // equivalent virtual sales while the product is new
  const popularScore = (p: (typeof all)[0]) => {
    const ageMs = Date.now() - new Date(p.added).getTime();
    const isNew = ageMs < NEW_BOOST_DAYS * 24 * 60 * 60 * 1000;
    return p.sold + (isNew ? NEW_BOOST_SCORE : 0);
  };
  const sorted = [...all].sort((a, b) =>
    tab === 'new' ? b.added.localeCompare(a.added) : tab === 'top' ? b.rating * Math.log(b.reviews + 2) - a.rating * Math.log(a.reviews + 2) : popularScore(b) - popularScore(a),
  );
  const featured = sorted.slice(0, 8);
  const sets = old ? collections(all) : views.map((v) => ({ key: v.hub.slug, title: v.hub.name, href: hubLinkHref(v.hub.slug), items: v.products, count: v.products.length }));
  const keep = (bps: number) => pct(10_000 - bps);

  // The hero's words, from the same strings as before; split here only so the headline can rise line by line and the scroll scenes can reuse them.
  const h1 = old ? 'Websites, apps and digital products, ready to use' : 'Website templates, ready to make yours';
  const sub = old
    ? 'Built once by real developers and made yours: your name, your domain, your store accounts. Look at the real thing before you pay.'
    : 'Built once by real developers and made yours: your name, your domain, your brand. Look at the real thing before you pay.';
  const cut = h1.lastIndexOf(', ') + 1;
  const [line1, line2] = [h1.slice(0, cut), h1.slice(cut + 1)];
  const accent = line2.lastIndexOf(' ') + 1;
  const look = sub
    .split(/(?<=\.)\s+/)
    .slice(1)
    .join(' ');
  const tabs = TABS.map(([k, label]) => [k, label, k === 'popular' ? '/' : `/?tab=${k}`] as const);
  const coverOf = (c: (typeof sets)[number], i: number) => c.items[i];
  const railed = views.filter((v) => v.products.length > 0);

  // The built-in sections, drawn in the order an admin saved in Site builder (hidden ones left out; the top banner always stays).
  const parts: Record<string, React.ReactNode> = {
    hero: (
      <>
        <section className="mk-hero vhero" aria-labelledby="mk-h1" data-scrub>
          <div className="vh-stick">
            <div className="screen">
              <Image className="vh-poster" src={HERO_POSTER} alt="" fill sizes="100vw" preload fetchPriority="high" />
              <HeroVideo />
              <span className="shade" aria-hidden="true" />
              <div className="chrome" aria-hidden="true">
                <i />
                <i />
                <i />
                <span className="url">
                  <Lock />
                  <span className="url-t">yourname.com</span>
                </span>
                <span className="lp">Live demo</span>
              </div>
            </div>
            <div className="vh-copy">
              <div className={'wrap vh-row' + (old ? ' with-side' : '')}>
                <div className="hero-copy">
                  <h1 id="mk-h1">
                    <span className="ln">
                      <span>{line1}</span>
                    </span>{' '}
                    <span className="ln">
                      <span>
                        {line2.slice(0, accent)}
                        <em className="swash">
                          {line2.slice(accent)}
                          <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                            <path d="M3 14 C 50 4, 120 4, 197 11" />
                          </svg>
                        </em>
                      </span>
                    </span>
                  </h1>
                  <p className="hero-sub">{sub}</p>
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
                {old && (
                  <div className="vh-side">
                    <HeroDomain />
                  </div>
                )}
              </div>
            </div>
            {/* The hero's second sentence again, as the caption over the shrinking window: decorative, the paragraph above already says it. */}
            <div className="vh-b wrap" aria-hidden="true">
              <span>{look}</span>
            </div>
            <span className="mouse" aria-hidden="true">
              <span className="m">
                <i />
              </span>
              <span className="chev" />
              <span className="mouse-t">Scroll</span>
            </span>
          </div>
        </section>
        {sets.length > 0 && (
          <section className="hscroll" aria-labelledby="mk-pop-h" data-scrub>
            <div className="hs-stick">
              <div className="wrap hs-head" data-reveal>
                <Kick>Browse by kind</Kick>
                <h2 id="mk-pop-h">
                  <span className="lr">
                    <span>Popular right now</span>
                  </span>
                </h2>
              </div>
              <div className="hs-track">
                {sets.map((c, n) => (
                  <Link key={c.key} className="panel" href={c.href} style={{ '--pc': PANEL_TINTS[n % PANEL_TINTS.length] } as React.CSSProperties}>
                    <span className="num" aria-hidden="true">
                      {String(n + 1).padStart(2, '0')}
                    </span>
                    {[0, 1].map((i) =>
                      coverOf(c, i) ? (
                        <span key={i} className={'pth ' + (i ? 'b' : 'a')} aria-hidden="true">
                          <Cover p={coverOf(c, i)!} alt="" sizes="(max-width: 600px) 70vw, 340px" />
                        </span>
                      ) : null,
                    )}
                    <h3>{c.title}</h3>
                    <span className="pc">
                      <span>{c.count > 0 && <em className="pcount">{c.count}</em>}</span>
                      <span className="go">See all</span>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="hs-bar" aria-hidden="true">
                <i />
              </div>
            </div>
          </section>
        )}
      </>
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
          <div className="mk-row">
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
      <section className="mk-sec sec fx cine-feat" aria-labelledby="ex-feat" data-reveal>
        <div className="wrap">
          <div className="mk-head sec-head">
            <div>
              <Kick>Handpicked</Kick>
              <h2 id="ex-feat">
                <span className="lr">
                  <span>Featured products</span>
                </span>
              </h2>
            </div>
            {old && (
              <Link className="link-u" href="/browse">
                Browse everything
              </Link>
            )}
          </div>
          <FeaturedTabs tab={tab} tabs={tabs}>
            {featured.map((p, i) => (
              <HomeCard key={p.id} p={p} d={i} href={old ? undefined : hubProductPath(productHub.get(p.id) ?? ecom.hub, alloc, p.id)} />
            ))}
          </FeaturedTabs>
        </div>
      </section>
    ),
    categories:
      railed.length > 0 ? (
        <div className="mk-cats-home">
          {railed.map((v, n) => (
            <section key={v.hub.slug} className={'mk-sec mk-cat-sec cat-sec fx' + (n % 2 ? ' amb' : '')} aria-labelledby={`cat-${v.hub.slug}`} data-reveal>
              <div className="wrap">
                <div className="mk-head sec-head">
                  <div>
                    <Kick>
                      {v.products.length} {v.products.length === 1 ? 'template' : 'templates'} · live demos
                    </Kick>
                    <div className="cat-title">
                      <h2 id={`cat-${v.hub.slug}`}>
                        <span className="lr">
                          <span>{v.hub.name}</span>
                        </span>
                      </h2>
                      <span className="count">{v.products.length}</span>
                    </div>
                  </div>
                  <div className="cat-end">
                    <RailControls rail={`rail-${v.hub.slug}`} label={v.hub.name} />
                    <Link className="link-u see" href={hubLinkHref(v.hub.slug)}>
                      See all
                    </Link>
                  </div>
                </div>
                <div id={`rail-${v.hub.slug}`} className="mk-grid rail stg">
                  {v.products.map((p, i) => (
                    <HomeCard key={p.id} p={p} d={i} href={old ? undefined : hubProductPath(v.hub, alloc, p.id)} />
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : null,
    why: (
      <section className="mk-why why" aria-labelledby="mk-why-h" data-reveal>
        <div className="wrap">
          <div className="head-c">
            <Kick>Buyer protection</Kick>
          </div>
          <h2 id="mk-why-h">
            <span className="lr">
              <span>Why people buy on SellOnBay</span>
            </span>
          </h2>
          <div className="stack">
            <article className="wcard" style={{ '--i': 0 } as React.CSSProperties} data-play>
              <div className="illo" aria-hidden="true">
                <span className="brw">
                  <span className="brw-bar">
                    <i />
                    <i />
                    <i />
                    <span>yourname.com</span>
                  </span>
                  <span className="brw-body">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="demo">Live demo</span>
                  <svg className="cursor" viewBox="0 0 24 24">
                    <path d="M4 2l16 9-7 2-3 7z" fill="#10142E" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <div className="wtext">
                <span className="k" aria-hidden="true">
                  01
                </span>
                <h3>Look before you pay</h3>
                <p>Click through the live site or try the app first. What you see is what the seller delivers.</p>
              </div>
            </article>
            <article className="wcard" style={{ '--i': 1 } as React.CSSProperties} data-play>
              <div className="illo" aria-hidden="true">
                <span className="esc">
                  <span className="node">
                    <b>1</b>You pay
                  </span>
                  <span className="link l1" />
                  <span className="node mid">
                    <b>
                      <Lock dark />
                    </b>
                    Held safely
                  </span>
                  <span className="link l2" />
                  <span className="node end">
                    <b>3</b>You accept
                  </span>
                </span>
              </div>
              <div className="wtext">
                <span className="k" aria-hidden="true">
                  02
                </span>
                <h3>Your money waits for you</h3>
                <p>Payment stays in escrow. You get {REVIEW_HOURS} hours to check the work, and a fair dispute if something is wrong.</p>
              </div>
            </article>
            <article className="wcard" style={{ '--i': 2 } as React.CSSProperties} data-play>
              <div className="illo" aria-hidden="true">
                <span className="dom">
                  <span className="dom-in">
                    <Lock />
                    <span className="typed">yourshop.com</span>
                  </span>
                  <span className="reg">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                      <path d="M5 10.5l3 3 7-7" />
                    </svg>
                    Registered to you
                  </span>
                </span>
              </div>
              <div className="wtext">
                <span className="k" aria-hidden="true">
                  03
                </span>
                <h3>Made to be yours</h3>
                <p>Domains and store accounts are in your name. Need changes? Order them from the seller or hire a developer.</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    ),
    steps: (
      <section className="mk-sec sec fx amb cine-how" aria-labelledby="mk-steps" data-reveal>
        <div className="wrap">
          <div className="sec-head">
            <div>
              <Kick>Four simple steps</Kick>
              <h2 id="mk-steps" className="mk-steps-h">
                <span className="lr">
                  <span>How a purchase goes</span>
                </span>
              </h2>
            </div>
          </div>
          <ol className="mk-steps cine-steps stg">
            <li>
              <span className="step-n" aria-hidden="true">
                1
              </span>
              <h3>Pick it</h3>
              <p>Find a site, app or file and look at the live demo.</p>
            </li>
            <li>
              <span className="step-n" aria-hidden="true">
                2
              </span>
              <h3>Pay into escrow</h3>
              <p>Your money is held. The seller cannot touch it yet.</p>
            </li>
            <li>
              <span className="step-n" aria-hidden="true">
                3
              </span>
              <h3>Get it delivered</h3>
              <p>
                Live on your domain or accounts in {CONFIG.delivery.minDays} to {CONFIG.delivery.maxDays} days. Files arrive at once.
              </p>
            </li>
            <li>
              <span className="step-n" aria-hidden="true">
                4
              </span>
              <h3>Check and accept</h3>
              <p>
                You have {REVIEW_HOURS} hours. The seller is paid {PAYOUT_HOLD_DAYS} days after you accept.
              </p>
            </li>
          </ol>
        </div>
      </section>
    ),
    sell: (
      <section className="mk-sellband seller" aria-labelledby="mk-sell-h" data-reveal>
        <div className="wrap mk-sellband-in seller-in">
          <div className="stg">
            <Kick>For sellers</Kick>
            <h2 id="mk-sell-h">
              <span className="lr">
                <span>Build once, sell it again and again</span>
              </span>
            </h2>
            <p>
              Upload a site, app or digital product once and deliver it to many buyers. You keep {PLAN_KEEP_TEXT} of every sale, depending on your plan ({keep(CONFIG.plans.free.commissionBps)} on the
              free plan); the same rate applies to custom and extra work.
            </p>
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
          {/* The same figures as the sentence beside it (PLAN_KEEP_TEXT), large: decorative, so screen readers hear them once. */}
          <div className="seller-fig" aria-hidden="true">
            <b>
              {PLAN_KEEP_TEXT.split(/(\d+(?:\.\d+)?)/).map((s, i) =>
                i % 2 ? (
                  <span key={i} data-count={/^\d+$/.test(s) ? s : undefined}>
                    {s}
                  </span>
                ) : (
                  s
                ),
              )}
            </b>
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
    <div className={'mk-home cine ' + serif.variable}>
      <HomeMotion />
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
