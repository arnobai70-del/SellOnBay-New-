import { ContactForm } from './ContactForm';
import { GlassCard } from '@/components/glass/GlassCard';
import { PageExtras } from '@/components/PageExtras';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { publishedFaq } from '@/lib/cms/docStore';
import { EMAIL_ROUTES } from '@/lib/emailRouting';
import { faqToShow } from '@/lib/faq';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/help', { alternates: { canonical: '/help' } });

export default async function Help() {
  const [words, saved] = await Promise.all([pageWords('/help'), publishedFaq()]);
  const { groups } = faqToShow(saved?.groups ?? null); // Admin > CMS, else built-in
  return (
    <>
      <div className="g-head">
        <h1>{words.heading}</h1>
        {words.intro && <p className="g-lead">{words.intro}</p>}
      </div>
      <div className="g-stack">
        {groups.map((g) => (
          <GlassCard key={g.title} as="section" rise={false}>
            <h2>{g.title}</h2>
            {g.items.map((f) => (
              <details key={f.q} className="g-li" style={{ display: 'block' }}>
                <summary style={{ cursor: 'pointer', fontSize: 15, minHeight: 28 }}>{f.q}</summary>
                <p className="g-muted" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
                  {f.a}
                </p>
              </details>
            ))}
          </GlassCard>
        ))}
      </div>
      <section className="g-sec" id="contact">
        <div className="g-grid2">
          <GlassCard>
            <h2>Still need help?</h2>
            <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
              Signed in? Open a ticket from your dashboard so it&apos;s linked to your order. Otherwise send us a message here.
            </p>
            <div className="g-li" style={{ marginTop: 10 }}>
              <span style={{ flex: 1, fontSize: 14 }}>Support</span>
              <a href={`mailto:${EMAIL_ROUTES.support}`}>{EMAIL_ROUTES.support}</a>
            </div>
            <div className="g-li">
              <span style={{ flex: 1, fontSize: 14 }}>Billing and payouts</span>
              <a href={`mailto:${EMAIL_ROUTES.billing}`}>{EMAIL_ROUTES.billing}</a>
            </div>
            <div className="g-li">
              <span style={{ flex: 1, fontSize: 14 }}>Partnerships and seller onboarding</span>
              <a href={`mailto:${EMAIL_ROUTES.business}`}>{EMAIL_ROUTES.business}</a>
            </div>
            <div className="g-li">
              <span style={{ flex: 1, fontSize: 14 }}>Abuse, copyright and security</span>
              <a href={`mailto:${EMAIL_ROUTES.report}`}>{EMAIL_ROUTES.report}</a>
            </div>
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
