import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { SearchBox } from '@/components/glass/SearchBox';
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
import { savedSocial } from '@/lib/site/contentStore';
import { pageCopy } from '@/lib/content/copy';
import { shownSocial } from '@/lib/site/social';

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

export default async function Home({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const [sites, sellers, social, c] = await Promise.all([publicWebsites(), publicSellers(), savedSocial(), pageCopy('home', (await searchParams).draft === '1')]);
  const sameAs = shownSocial(social).map((l) => l.url);
  const featured = browse(sites, readQuery({}, []), () => null).items.slice(0, 6);
  // Each section an admin can hide or move (Admin › Content › Pages); the top banner always comes first.
  const SECTIONS: Record<string, React.ReactNode> = {
    pillars: (
      <section className="g-sec" key="pillars">
        <h2>{c.t('pillars', 'heading')}</h2>
        <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
          {c.t('pillars', 'intro')}
        </p>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {['1', '2', '3'].map((n) => (
            <GlassCard key={n} as="article" reveal>
              <div className="g-tag">
                0{n} · {c.t('pillars', `p${n}who`)}
              </div>
              <h3 style={{ fontSize: 20, marginTop: 8 }}>{c.t('pillars', `p${n}title`)}</h3>
              <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
                {c.t('pillars', `p${n}text`)}
              </p>
              <ul className="g-list">
                {c.lines('pillars', `p${n}points`).map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
              </ul>
              <div style={{ marginTop: 16 }}>
                <Button variant="ghost" href={c.t('pillars', `p${n}href`)}>
                  {c.t('pillars', `p${n}cta`)}
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>
    ),
    featured: (
      <section className="g-sec" key="featured">
        <div className="g-row">
          <h2>{c.t('featured', 'heading')}</h2>
          <Button variant="ghost" size="sm" href="/websites">
            {c.t('featured', 'all')}
          </Button>
        </div>
        {featured.length ? (
          <div className="g-grid3" style={{ marginTop: 18 }} data-track="featured-websites">
            {featured.map((p) => (
              <WebsiteCard key={p.id} p={p} reveal />
            ))}
          </div>
        ) : (
          <p className="g-muted" style={{ marginTop: 18 }}>
            {c.t('featured', 'empty')}
          </p>
        )}
      </section>
    ),
    domains: (
      <section className="g-sec" key="domains">
        <GlassCard reveal>
          <div className="g-tag">{c.t('domains', 'tag')}</div>
          <h2 style={{ marginTop: 8 }}>{c.t('domains', 'heading')}</h2>
          <form className="g-row" action="/domains" method="get" style={{ marginTop: 14, justifyContent: 'flex-start' }} data-track="domains">
            <label className="g-sr" htmlFor="home-domain">
              Search a domain
            </label>
            <input id="home-domain" className="g-input" name="q" placeholder={c.t('domains', 'hint')} style={{ flex: '1 1 220px', width: 'auto' }} />
            <Button type="submit">{c.t('domains', 'button')}</Button>
          </form>
          <p className="g-tag">
            {TLDS.slice(0, 4)
              .map(([t, price]) => `${t} $${price}`)
              .join(' · ')}
          </p>
        </GlassCard>
      </section>
    ),
    how: (
      <section className="g-sec" key="how">
        <div className="g-row">
          <h2>{c.t('how', 'heading')}</h2>
          <Button variant="ghost" size="sm" href="/buyer-protection">
            {c.t('how', 'link')}
          </Button>
        </div>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {[1, 2, 3, 4].map((i) => (
            <GlassCard key={i} reveal>
              <span className="g-step-n">{i}</span>
              <h3>{c.t('how', `s${i}t`)}</h3>
              <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
                {c.t('how', `s${i}d`)}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>
    ),
    sellers:
      sellers.length > 0 ? (
        <section className="g-sec" key="sellers">
          <div className="g-row">
            <h2>{c.t('sellers', 'heading')}</h2>
            <Button variant="ghost" size="sm" href="/sellers">
              {c.t('sellers', 'all')}
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
      ) : null,
    sell: (
      <section className="g-sec" key="sell">
        <GlassCard reveal>
          <h2>{c.t('sell', 'heading')}</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            {c.t('sell', 'text')}
          </p>
          <div style={{ marginTop: 14 }}>
            <Button href="/sell" data-track="start-selling">
              {c.t('sell', 'button')}
            </Button>
          </div>
        </GlassCard>
      </section>
    ),
  };
  return (
    <>
      {c.preview && (
        <p className="g-banner g-banner-warn" role="status">
          Preview of the saved draft. Visitors still see the published words.
        </p>
      )}
      <section className="g-hero">
        <h1>
          <span className="g-hl">
            <span>{c.t('hero', 'title')}</span>
          </span>
        </h1>
        <p className="g-lead">{c.t('hero', 'lead')}</p>
        <div className="g-glass g-search">
          <SearchBox action="/websites" label="Search websites" placeholder={c.t('hero', 'search')} track="hero-search" />
        </div>
        <div className="g-chips">
          {HUBS.map((h) => (
            <Link key={h.slug} className="g-chip" href={categoryPath(h.slug)}>
              {h.name.replace(/ Websites$/, '')}
            </Link>
          ))}
        </div>
      </section>

      {c.order.map((k) => SECTIONS[k] ?? null)}

      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL, ...(sameAs.length ? { sameAs } : {}) }} />
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
