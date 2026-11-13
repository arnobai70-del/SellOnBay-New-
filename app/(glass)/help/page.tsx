import { SearchBox } from '@/components/glass/SearchBox';
import { ContactForm } from './ContactForm';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { SocialRow } from '@/components/glass/SocialRow';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { publishedFaq } from '@/lib/cms/docStore';
import { pageCopy } from '@/lib/content/copy';
import { faqToShow } from '@/lib/faq';
import { helpAnchor } from '@/lib/searchCore';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';

import { getI18n } from '@/lib/i18n/server';
export const revalidate = 300;
export const generateMetadata = () => pageMetadata('/help', { alternates: { canonical: '/help' } });

/* The design's tile icons, in the order of the help groups. */
const TILES: [bg: string, d: string][] = [
  ['#DDEAF6', 'M3 4h18v14H3zM3 9h18'],
  ['#F6E0EA', 'M3 7h18v10H3zM7 12h.01'],
  ['#DCF0E7', 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'],
  ['#E6E2F4', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18'],
  ['#F1E8DD', 'M4 20h16M6 16l6-12 6 12'],
  ['#E8EEF2', 'M12 4v12M7 11l5 5 5-5M5 20h14'],
];
const groupId = (t: string) => 'g-' + helpAnchor(t).replace(/^q-/, '');

/*
 * design-reference/help.html: the search (the site's smart search, Help results included), the help groups as tiles, every question with its
 * own address (#q-..., used by search), and contact: the routes and social links an admin set, and the contact form (/api/contact).
 * Questions come from Admin › CMS, else the built-in ones; the heading from Admin › Content › Pages.
 */
export default async function Help() {
  const { tx, translate } = await getI18n(); // words in the page's language (lib/i18n/tx.ts); translate() for the built-in questions
  const [words, saved, routes, social, copy] = await Promise.all([pageWords('/help'), publishedFaq(), contactRoutes(), savedSocial(), pageCopy('help')]);
  const { groups } = faqToShow(saved?.groups ?? null);
  const intro = copy.t('head', 'intro', words.intro ?? '');
  return (
    <PublicFrame file="help">
      <section style={{ padding: '80px 0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 18 }}>
        <h1 style={{ fontSize: 'clamp(36px,5vw,54px)', fontWeight: 300 }}>
          <span className="hl">
            <span>{copy.t('head', 'heading', words.heading)}</span>
          </span>
        </h1>
        {intro && (
          <p className="muted fade-in" style={{ margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
            {intro}
          </p>
        )}
        {/* suggests while typing (SearchBox, owner 2026-11-14); a GET form without JavaScript */}
        <SearchBox variant="pill" inputId="hs" action="/search" maxWidth={640} label={tx('Search help')} placeholder={tx('e.g. payment, refund, connect domain')} />
      </section>
      <section className="grid3" style={{ paddingTop: 24 }}>
        {groups.map((g, i) => (
          <a key={g.title} className="glass cat" href={`#${groupId(g.title)}`}>
            <span className="i" style={{ background: TILES[i % TILES.length][0] }} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B4250" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={TILES[i % TILES.length][1]} />
              </svg>
            </span>
            <b style={{ fontWeight: 500, marginTop: 6 }}>{translate(g.title)}</b>
            <span className="muted" style={{ fontSize: 14 }}>
              {g.items.length} {g.items.length === 1 ? 'answer' : 'answers'}
            </span>
          </a>
        ))}
      </section>
      <section id="articles" className="sec grid2">
        {groups.map((g) => (
          <div key={g.title} id={groupId(g.title)} className="glass card">
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>{translate(g.title)}</h2>
            {g.items.map((f) => (
              <details key={f.q} id={helpAnchor(f.q)}>
                <summary className="art" style={{ listStyle: 'none', cursor: 'pointer' }}>
                  {translate(f.q)} <span aria-hidden="true">›</span>
                </summary>
                <p className="muted" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>
                  {translate(f.a)}
                </p>
              </details>
            ))}
          </div>
        ))}
      </section>
      <section id="contact" className="sec">
        <div className="glass card" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 280px' }}>
            <h2 style={{ fontSize: 28, fontWeight: 300 }}>{copy.t('contact', 'heading')}</h2>
            <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
              {copy.t('contact', 'text')}
            </p>
            {(
              [
                ['Support', routes.support],
                [tx('Billing and payouts'), routes.billing],
                ['Partnerships', routes.business],
                [tx('Abuse and copyright'), routes.report],
              ] as const
            ).map(([l, e], i) => (
              <div key={l} className="li" style={{ fontSize: 14, marginTop: i ? 0 : 14 }}>
                <span className={i ? 'status st-draft' : 'status st-info'}>{l}</span>
                <a href={`mailto:${e}`}>{e}</a>
              </div>
            ))}
            <SocialRow links={social} label="SellOnBay elsewhere" />
          </div>
          <ContactForm siteKey={liveSiteKey() || undefined} />
        </div>
      </section>
      <PageExtras path="/help" />
    </PublicFrame>
  );
}
