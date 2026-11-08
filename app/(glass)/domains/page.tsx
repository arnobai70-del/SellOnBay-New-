import { Button } from '@/components/glass/Button';
import { pageCopy } from '@/lib/content/copy';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { PageExtras } from '@/components/PageExtras';
import { ALL_TLDS, cleanName, registrarLive, TLDS } from '@/lib/domains';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const dynamic = 'force-dynamic';
export const generateMetadata = () => pageMetadata('/domains', { alternates: { canonical: '/domains' } });

/*
 * No registrar is connected (owner, 2026-11-07): registration is done by hand, so this page never says a name is free. It shows the endings and prices, and our team
 * checks availability when the order is placed. When a registrar is connected, `registrarLive` turns into real answers here.
 */
export default async function Domains({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const name = cleanName(String(q));
  const words = await pageWords('/domains');
  const copy = await pageCopy('domains'); // Admin › Content › Pages; empty fields keep the page's own words
  return (
    <>
      <div className="g-head">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        {copy.t('head', 'intro', words.intro ?? '') && <p className="g-lead">{copy.t('head', 'intro', words.intro ?? '')}</p>}
        <form className="g-glass g-search" action="/domains" method="get" role="search">
          <label className="g-sr" htmlFor="domain-q">
            Search a domain
          </label>
          <input id="domain-q" name="q" defaultValue={name} placeholder="yourbrand" />
          <Button type="submit">Check availability</Button>
        </form>
        <p className="g-tag">
          {TLDS.slice(0, 5)
            .map(([t, p]) => `${t} $${p}`)
            .join(' · ')}{' '}
          · first year, USD
        </p>
      </div>
      {name && (
        <section aria-label="Results">
          <h2>Endings for &ldquo;{name}&rdquo;</h2>
          <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
            {registrarLive() ? 'Live results.' : 'We check availability by hand when you order, and tell you before anything is registered.'}
          </p>
          <div className="g-grid3" style={{ marginTop: 14 }}>
            {ALL_TLDS.map(([tld, price]) => (
              <GlassCard key={tld} as="article" className="g-row">
                <div>
                  <b style={{ fontWeight: 500 }}>
                    {name}
                    {tld}
                  </b>
                  <div className="g-tag">${price} first year</div>
                </div>
                <StatusPill tone="draft">Checked on order</StatusPill>
              </GlassCard>
            ))}
          </div>
        </section>
      )}
      <section className="g-sec">
        <h2>Why buy your domain here</h2>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {[
            ['In your own name', 'You are the registered owner. Sellers never hold your domain.'],
            ['Help connecting it', 'We help you point the domain at your new website.'],
            ['Renewal reminders', 'We remind you before it expires.'],
          ].map(([t, d]) => (
            <GlassCard key={t} reveal>
              <h3>{t}</h3>
              <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
                {d}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>
      <section className="g-sec">
        <GlassCard>
          <h2>Domain questions</h2>
          <div className="g-li" style={{ display: 'block' }}>
            <b style={{ fontWeight: 500, fontSize: 14 }}>Can I use a domain I already own?</b>
            <p className="g-muted" style={{ marginTop: 4, fontSize: 14 }}>
              Yes. Use it with any website you buy here.
            </p>
          </div>
          <div className="g-li" style={{ display: 'block' }}>
            <b style={{ fontWeight: 500, fontSize: 14 }}>Is the domain refunded if I reject the website?</b>
            <p className="g-muted" style={{ marginTop: 4, fontSize: 14 }}>
              [DOMAIN REFUND POLICY]
            </p>
          </div>
        </GlassCard>
      </section>
      <PageExtras path="/domains" />
    </>
  );
}
