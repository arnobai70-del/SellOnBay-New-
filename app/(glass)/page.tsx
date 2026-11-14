import { localizeMetadata } from '@/lib/i18n/seo';
import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import Link from 'next/link';
import { HeroSearch } from '@/components/glass/HeroSearch';
import { Mint, TopBand } from '@/components/glass/TopBand';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { WebsiteCard } from '@/components/glass/WebsiteCard';
import { JsonLd } from '@/components/JsonLd';
import { PageExtras } from '@/components/PageExtras';
import { PLAN_KEEP_TEXT, REVIEW_HOURS } from '@/lib/config';
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

import { T } from '@/components/i18n/T';
import type { Tx } from '@/lib/i18n/tx';
import { getI18n } from '@/lib/i18n/server';
const HOME_DESCRIPTION = `Buy ready-made full-stack websites with escrow protection, get a domain in your own name, or sell your own websites and keep ${PLAN_KEEP_TEXT}.`;

/* An admin can set the title and description Google shows, and the Search Console codes, at Admin > SEO. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo();
  const description = seo.homeDescription || HOME_DESCRIPTION;
  // Each language's home names itself as canonical (/bn, /de) and lists the others (hreflang); English keeps "/" exactly as before.
  const meta = applyControls(
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
  return localizeMetadata('/', meta);
}
// Static, refreshed every 5 minutes; it renders on request only in Draft Mode, which an admin's preview turns on (app/api/admin/preview).
export const revalidate = 300;

/* The last sentence goes on its own line, as the design's two-line heading ("Buy a website. Get a domain." / "Or sell your own."). */
function twoLines(s: string): [string, string] {
  const i = s.trim().lastIndexOf('. ', s.trim().length - 2);
  return i > 0 ? [s.slice(0, i + 1), s.slice(i + 2)] : [s, ''];
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
const AVATARS = ['#E6E2F4', '#DCEBF5', '#DCF0E7', '#F1E8DD'];
const PILLAR_ICON = [
  {
    bg: '#DCEBF5',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M9 9v11" />
      </>
    ),
  },
  {
    bg: '#DCF0E7',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </>
    ),
  },
  {
    bg: '#E6E2F4',
    icon: (
      <>
        <path d="M3 17l6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </>
    ),
  },
];
const TRUST = (tx: Tx) => [
  [tx('Escrow protection'), tx('Your payment is held safely until you approve the site.')],
  [`${REVIEW_HOURS}-hour review`, tx('Check the files and setup before the seller is paid.')],
  [tx('Live demo first'), tx('Click through every website before you buy.')],
  [tx('Domain in your name'), tx('Your domain is registered to you, not the seller.')],
];
const DOT = <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7FBFA9', flex: 'none' }} />;
const ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 20 } as const;

/* The home title's key words in mint ("website", "domain"; option C of the hero canvas). Words of other languages stay white. */
const mintWords = (text: string) => text.split(/((?:website|domain)s?)/i).map((part, i) => (i % 2 ? <Mint key={i}>{part}</Mint> : part));

/* design-reference/index.html, wired to the live listings, sellers and the words an admin sets at Admin › Content › Pages › Home. */
export default async function Home() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const draft = (await draftMode()).isEnabled;
  const [sites, sellers, social, c] = await Promise.all([publicWebsites(), publicSellers(), savedSocial(), pageCopy('home', draft)]);
  const sameAs = shownSocial(social).map((l) => l.url);
  const featured = browse(sites, readQuery({}, []), () => null).items.slice(0, 6);
  const [line1, line2] = twoLines(c.t('hero', 'title'));
  const [sell1, sell2] = twoLines(c.t('sell', 'heading'));
  // Each section an admin can hide or move (Admin › Content › Pages); the top banner always comes first.
  const SECTIONS: Record<string, React.ReactNode> = {
    pillars: (
      <div key="pillars">
        <section className="reveal" style={{ padding: '40px 0 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <h2 style={{ fontSize: 30 }}>{c.t('pillars', 'heading')}</h2>
            <p className="muted" style={{ margin: '8px 0 0' }}>
              {c.t('pillars', 'intro')}
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 18 }}>
            {(['1', '2', '3'] as const).map((n, i) => (
              <div key={n} className="glass pillar" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    className="ico"
                    style={{ width: 48, height: 48, borderRadius: 14, background: PILLAR_ICON[i].bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    aria-hidden="true"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2B4250" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      {PILLAR_ICON[i].icon}
                    </svg>
                  </span>
                  <span className="tag" style={{ margin: 0, letterSpacing: '.08em' }}>
                    0{n}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#3F7F6B', fontWeight: 500 }}>{c.t('pillars', `p${n}who`)}</div>
                  <h3 style={{ fontSize: 22, marginTop: 6 }}>{c.t('pillars', `p${n}title`)}</h3>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  {c.t('pillars', `p${n}text`)}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: '#3D5563' }}>
                  {c.lines('pillars', `p${n}points`).map((x) => (
                    <div key={x} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {DOT}
                      {x}
                    </div>
                  ))}
                </div>
                <Link className="btn" href={c.t('pillars', `p${n}href`)} style={{ alignSelf: 'flex-start', marginTop: 4 }} prefetch={false}>
                  {c.t('pillars', `p${n}cta`)}
                </Link>
              </div>
            ))}
          </div>
        </section>
        <section className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 16, padding: '40px 0 72px' }}>
          {TRUST(tx).map(([t, d]) => (
            <div key={t} className="glass" style={{ padding: 22, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span
                className="ico"
                style={{ width: 40, height: 40, borderRadius: 12, background: '#E2F3EC', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                aria-hidden="true"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{t}</div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>
                  {d}
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    ),
    featured: (
      <section className="reveal" key="featured">
        <div style={ROW}>
          <h2 style={{ fontSize: 28 }}>{c.t('featured', 'heading')}</h2>
          <Link className="btn ghost" href="/websites" prefetch={false}>
            {c.t('featured', 'all')}
          </Link>
        </div>
        {featured.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 20 }} data-track="featured-websites">
            {featured.map((p) => (
              <WebsiteCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="glass card" style={{ padding: 28, textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              {c.t('featured', 'empty')}
            </p>
          </div>
        )}
      </section>
    ),
    domains: (
      <div className="reveal" key="domains">
        <section className="glass" style={{ marginTop: 72, padding: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', maxWidth: 480 }}>
            <span className="badge">{c.t('domains', 'tag')}</span>
            <h2 style={{ fontSize: 30, fontWeight: 300, marginTop: 12 }}>{c.t('domains', 'heading')}</h2>
            <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 15 }}>
              {c.t('pillars', 'p2text')}
            </p>
          </div>
          <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <form
              action="/domains"
              method="get"
              data-track="domains"
              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px 6px 18px', borderRadius: 999, background: 'rgba(255,255,255,.8)', border: '1px solid #DCE7EC' }}
            >
              <label htmlFor="dm" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                <T s={'Search a domain'} />
              </label>
              <input
                id="dm"
                name="q"
                placeholder={c.t('domains', 'hint')}
                style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '15px var(--font-inter), Inter, sans-serif', color: '#2B4250', outline: 'none', minHeight: 44 }}
              />
              <button className="btn" type="submit">
                {c.t('domains', 'button')}
              </button>
            </form>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14, color: '#3D5563', paddingLeft: 8 }}>
              {TLDS.slice(0, 4).map(([t, price]) => (
                <span key={t}>
                  {t} <b style={{ fontWeight: 500 }}>${price}</b>
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    ),
    how: (
      <section id="how" className="reveal" style={{ padding: '88px 0 0' }} key="how">
        <div style={ROW}>
          <h2 style={{ fontSize: 28 }}>{c.t('how', 'heading')}</h2>
          <Link className="btn ghost" href="/buyer-protection" prefetch={false}>
            {c.t('how', 'link')}
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass" style={{ padding: 24 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#CDEBDF',
                  color: '#1A5444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                {i}
              </div>
              <div style={{ fontWeight: 500, marginTop: 16 }}>{c.t('how', `s${i}t`)}</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>
                {c.t('how', `s${i}d`)}
              </div>
            </div>
          ))}
        </div>
      </section>
    ),
    sellers: (
      <section className="reveal" style={{ padding: '88px 0 0' }} key="sellers">
        <div style={ROW}>
          <h2 style={{ fontSize: 28 }}>{c.t('sellers', 'heading')}</h2>
          <Link className="btn ghost" href="/sellers" prefetch={false}>
            {c.t('sellers', 'all')}
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 16 }}>
          {sellers.slice(0, 4).map((s, i) => (
            <div key={s.key} className="glass" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="avatar" style={{ background: AVATARS[i % AVATARS.length] }} aria-hidden="true">
                {initials(s.name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{s.name}</div>
                <div className="tag">
                  {s.skills[0] ? `${s.skills[0]} · ` : ''}
                  {s.websites.length} {s.websites.length === 1 ? 'website' : 'websites'}
                </div>
              </div>
              <Link className="btn" href={`/sellers/${s.handle}`} style={{ padding: '0 16px' }} prefetch={false}>
                <T s={'View'} />
              </Link>
            </div>
          ))}
          {sellers.length === 0 && (
            <div className="glass" style={{ padding: 18 }}>
              <span className="muted">
                <T s={'Sellers appear here once their first website is live.'} />
              </span>
            </div>
          )}
        </div>
      </section>
    ),
    sell: (
      <div className="reveal" key="sell">
        <section className="glass" style={{ marginTop: 88, padding: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 34, fontWeight: 300 }}>
              {sell1}
              {sell2 && (
                <>
                  <br />
                  {sell2}
                </>
              )}
            </h2>
            <p className="muted" style={{ margin: '14px 0 0', lineHeight: 1.6 }}>
              {c.t('sell', 'text')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" href="/sell" data-track="start-selling" prefetch={false}>
              {c.t('sell', 'button')}
            </Link>
            <Link className="btn ghost" href="/sell#how" prefetch={false}>
              <T s={'How selling works'} />
            </Link>
          </div>
        </section>
      </div>
    ),
  };
  return (
    <PublicFrame file="index">
      {c.preview && (
        <p className="sob-note" role="status">
          <T s={'Preview of the saved draft. Visitors still see the published words.'} />
        </p>
      )}
      <TopBand
        size="home"
        align="center"
        eyebrow={<T s={'Full-stack websites · Domains · Seller marketplace'} />}
        title={
          <>
            {mintWords(line1)}
            {line2 && (
              <>
                <br />
                {mintWords(line2)}
              </>
            )}
          </>
        }
        intro={c.t('hero', 'lead')}
      >
        <HeroSearch placeholder={c.t('hero', 'search')} />
        <div className="sob-band-chips">
          <Link className="chip on" href="/websites" prefetch={false}>
            <T s={'All'} />
          </Link>
          {HUBS.map((h) => (
            <Link key={h.slug} className="chip" href={categoryPath(h.slug)} prefetch={false}>
              {h.name.replace(/ Websites$/, '')}
            </Link>
          ))}
        </div>
      </TopBand>

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
    </PublicFrame>
  );
}
