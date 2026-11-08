import { ContactForm } from './ContactForm';
import { pageCopy } from '@/lib/content/copy';
import { GlassCard } from '@/components/glass/GlassCard';
import { PageExtras } from '@/components/PageExtras';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { publishedFaq } from '@/lib/cms/docStore';
import { SocialRow } from '@/components/glass/SocialRow';
import { helpAnchor } from '@/lib/searchCore';
import { contactRoutes, savedSocial } from '@/lib/site/contentStore';
import { faqToShow } from '@/lib/faq';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/help', { alternates: { canonical: '/help' } });

export default async function Help() {
  const [words, saved, routes, social] = await Promise.all([pageWords('/help'), publishedFaq(), contactRoutes(), savedSocial()]);
  const { groups } = faqToShow(saved?.groups ?? null); // Admin > CMS, else built-in
  const copy = await pageCopy('help'); // Admin › Content › Pages; empty fields keep the page's own words
  return (
    <>
      <div className="g-head">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        {copy.t('head', 'intro', words.intro ?? '') && <p className="g-lead">{copy.t('head', 'intro', words.intro ?? '')}</p>}
      </div>
      <div className="sob-stack">
        {groups.map((g) => (
          <GlassCard key={g.title} as="section" rise={false}>
            <h2>{g.title}</h2>
            {g.items.map((f) => (
              <details key={f.q} id={helpAnchor(f.q)} className="li" style={{ display: 'block' }}>
                <summary style={{ cursor: 'pointer', fontSize: 15, minHeight: 28 }}>{f.q}</summary>
                <p className="muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </GlassCard>
        ))}
      </div>
      <section className="g-sec" id="contact">
        <div className="grid2">
          <GlassCard>
            <h2>{copy.t('contact', 'heading')}</h2>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              {copy.t('contact', 'text')}
            </p>
            <div className="li" style={{ marginTop: 10 }}>
              <span style={{ flex: 1, fontSize: 14 }}>Support</span>
              <a href={`mailto:${routes.support}`}>{routes.support}</a>
            </div>
            <div className="li">
              <span style={{ flex: 1, fontSize: 14 }}>Billing and payouts</span>
              <a href={`mailto:${routes.billing}`}>{routes.billing}</a>
            </div>
            <div className="li">
              <span style={{ flex: 1, fontSize: 14 }}>Partnerships and seller onboarding</span>
              <a href={`mailto:${routes.business}`}>{routes.business}</a>
            </div>
            <div className="li">
              <span style={{ flex: 1, fontSize: 14 }}>Abuse, copyright and security</span>
              <a href={`mailto:${routes.report}`}>{routes.report}</a>
            </div>
            <SocialRow links={social} label="SellOnBay elsewhere" />
          </GlassCard>
          <GlassCard>
            <ContactForm siteKey={liveSiteKey() || undefined} />
          </GlassCard>
        </div>
      </section>
      <PageExtras path="/help" />
    </>
  );
}
