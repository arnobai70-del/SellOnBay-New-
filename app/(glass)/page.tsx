import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { PAYOUT_TEXT, PLAN_KEEP_TEXT, REVIEW_HOURS, CONFIG } from '@/lib/config';
import { TLDS } from '@/lib/domains';
import { browse, readQuery } from '@/lib/glass/browse';
import { categoryPath, publicSellers, publicWebsites } from '@/lib/glass/catalog';
import { getSeo } from '@/lib/seo/site';
import { HUBS } from '@/lib/seo/hubs';
import { applyControls } from '@/lib/seo/applyControls';
import { pageControls } from '@/lib/seo/controlStore';
import { SITE_NAME, SITE_URL } from '@/lib/site';

const HOME_DESCRIPTION = `Buy ready-made full-stack websites with escrow protection, get a domain in your own name, or sell your own websites and keep ${PLAN_KEEP_TEXT}.`;

/* An admin can set the title and description Google shows, and the Search Console codes, at Admin > SEO. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo();
  const description = seo.homeDescription || HOME_DESCRIPTION;
  return applyControls(
    '/',
    {
      title: { absolute: seo.homeTitle || `${SITE_NAME}: full-stack websites, domains and a seller marketplace` },
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

const PILLARS = [
  {
    n: '01',
    who: 'For buyers',
    t: 'Full-stack websites',
    d: 'Pick a complete, working website with frontend, backend and database. Try the live demo and buy safely with escrow.',
    li: ['Live demo before you buy', `Escrow and a ${REVIEW_HOURS}-hour review`, 'Customization by the seller'],
    href: '/websites',
    cta: 'Browse websites',
  },
  {
    n: '02',
    who: 'For everyone',
    t: 'Domains',
    d: 'Check a name and we register it for you, in your own name.',
    li: ['Registered in your own name', 'Reminders before it expires', 'Help connecting it to your site'],
    href: '/domains',
    cta: 'Find a domain',
  },
  {
    n: '03',
    who: 'For developers',
    t: 'Seller platform',
    d: 'Upload your full-stack websites, set your price and get paid after each review.',
    li: [`Keep ${PLAN_KEEP_TEXT} of every sale`, `Prices from $${CONFIG.sale.priceMinCents / 100}`, 'Your own seller store'],
    href: '/sell',
    cta: 'Start selling',
  },
];
const STEPS = [
  { t: 'Try the live demo', d: 'Open the real site and test every page.' },
  { t: 'Pay into escrow', d: 'SellOnBay holds your payment, not the seller.' },
  { t: `Review for ${REVIEW_HOURS} hours`, d: 'Get the files, check them, ask for fixes.' },
  { t: 'Approve and launch', d: 'The seller is paid and the site is yours.' },
];

export default async function Home() {
  const [sites, sellers] = await Promise.all([publicWebsites(), publicSellers()]);
  const featured = browse(sites, readQuery({}, []), () => null).items.slice(0, 6);
  return (
    <>
      <section className="g-hero">
        <h1>
          <span className="g-hl">
            <span>Buy a website. Get a domain. Or sell your own.</span>
          </span>
        </h1>
        <p className="g-lead">
          One place for your online business: ready-made full-stack websites with escrow protection, domains in your own name, and a marketplace where developers keep {PLAN_KEEP_TEXT} of every sale.
        </p>
        <form className="g-glass g-search" action="/websites" method="get" role="search">
          <label className="g-sr" htmlFor="home-q">
            Search websites
          </label>
          <input id="home-q" name="q" placeholder="Search full-stack websites" />
          <Button type="submit">Search</Button>
        </form>
        <div className="g-chips">
          {HUBS.map((h) => (
            <Link key={h.slug} className="g-chip" href={categoryPath(h.slug)}>
              {h.name.replace(/ Websites$/, '')}
            </Link>
          ))}
        </div>
      </section>

      <section className="g-sec">
        <h2>Three things, one platform</h2>
        <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
          Everything a website needs, from the first idea to launch.
        </p>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {PILLARS.map((p) => (
            <GlassCard key={p.n} as="article" reveal>
              <div className="g-tag">
                {p.n} · {p.who}
              </div>
              <h3 style={{ fontSize: 20, marginTop: 8 }}>{p.t}</h3>
              <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                {p.d}
              </p>
              <ul className="g-list">
                {p.li.map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
              </ul>
              <div style={{ marginTop: 16 }}>
                <Button variant="ghost" href={p.href}>
                  {p.cta}
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="g-sec">
        <div className="g-row">
          <h2>Featured websites</h2>
          <Button variant="ghost" size="sm" href="/websites">
            Browse all
          </Button>
        </div>
        {featured.length ? (
          <div className="g-grid3" style={{ marginTop: 18 }}>
            {featured.map((p) => (
              <WebsiteCard key={p.id} p={p} reveal />
            ))}
          </div>
        ) : (
          <p className="g-muted" style={{ marginTop: 18 }}>
            New websites are on their way.
          </p>
        )}
      </section>

      <section className="g-sec">
        <GlassCard reveal>
          <div className="g-tag">Domains</div>
          <h2 style={{ marginTop: 8 }}>Your name on the web, in your name.</h2>
          <form className="g-row" action="/domains" method="get" style={{ marginTop: 14, justifyContent: 'flex-start' }}>
            <label className="g-sr" htmlFor="home-domain">
              Search a domain
            </label>
            <input id="home-domain" className="g-input" name="q" placeholder="yourbrand" style={{ flex: '1 1 220px', width: 'auto' }} />
            <Button type="submit">Check availability</Button>
          </form>
          <p className="g-tag">
            {TLDS.slice(0, 4)
              .map(([t, price]) => `${t} $${price}`)
              .join(' · ')}
          </p>
        </GlassCard>
      </section>

      <section className="g-sec">
        <div className="g-row">
          <h2>How buying works</h2>
          <Button variant="ghost" size="sm" href="/buyer-protection">
            Buyer protection
          </Button>
        </div>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {STEPS.map((s, i) => (
            <GlassCard key={s.t} reveal>
              <span className="g-step-n">{i + 1}</span>
              <h3>{s.t}</h3>
              <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
                {s.d}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>

      {sellers.length > 0 && (
        <section className="g-sec">
          <div className="g-row">
            <h2>Top sellers</h2>
            <Button variant="ghost" size="sm" href="/sellers">
              See all sellers
            </Button>
          </div>
          <div className="g-grid3" style={{ marginTop: 18 }}>
            {sellers.slice(0, 4).map((s) => (
              <GlassCard key={s.key} reveal className="g-row">
                <div>
                  <h3>{s.name}</h3>
                  <div className="g-tag">
                    {s.websites.length} {s.websites.length === 1 ? 'website' : 'websites'}
                  </div>
                </div>
                <Button variant="ghost" size="sm" href={`/sellers/${s.handle}`}>
                  View
                </Button>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      <section className="g-sec">
        <GlassCard reveal>
          <h2>Sell your full-stack websites. Keep {PLAN_KEEP_TEXT} of every sale.</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Upload your site with a live demo and set your price from ${CONFIG.sale.priceMinCents / 100}. {PAYOUT_TEXT}.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button href="/sell">Start selling</Button>
          </div>
        </GlassCard>
      </section>

      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL }} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL,
          potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/websites?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
        }}
      />
      <PageExtras path="/" name={SITE_NAME} />
    </>
  );
}
