import { TopBand } from '@/components/glass/TopBand';
import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { CONFIG, DOMAIN_REFUND_TEXT } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { ALL_TLDS, cleanName, registrarLive, TLDS } from '@/lib/domains';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = () => pageMetadata('/domains', { alternates: { canonical: '/domains' } });

const FEATURES = (tx: Tx): [string, string, string[]][] => [
  [tx('In your own name'), tx('You are the registered owner. Sellers never hold your domain.'), ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6']],
  [tx('Help connecting it'), tx('We help you point the domain at your new website.'), ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']],
  [tx('Checked by a person'), tx('We check the name with the registrar by hand before anything is registered.'), ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z']],
  [tx('Renewal reminders'), tx('We email you {v0} days before it expires.', { v0: CONFIG.domain.reminderDays.join(', ') }), ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2']],
];

/*
 * design-reference/domains.html. No registrar is connected (owner, 2026-11-07): registration is done by hand, so this page never says a name is
 * free. It shows the endings and prices (lib/domains.ts), and a name goes on with a website (the domain step of the request). When a registrar is
 * connected, `registrarLive` turns into real answers here. Refund wording: owner, 2026-11-09.
 */
export default async function Domains({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const { q = '' } = await searchParams;
  const name = cleanName(String(q));
  const [words, copy] = await Promise.all([pageWords('/domains'), pageCopy('domains')]);
  const heading = copy.t('head', 'heading', words.heading);
  const intro = copy.t('head', 'intro', words.intro ?? '');
  return (
    <PublicFrame file="domains">
      <TopBand eyebrow={<T s={'Registered in your own name'} />} title={heading} intro={intro || undefined}>
        <form
          className="glass search-glow"
          action="/domains"
          method="get"
          role="search"
          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 700, padding: '8px 8px 8px 22px', borderRadius: 999, boxSizing: 'border-box' }}
        >
          <label htmlFor="dq" className="hidden-label">
            <T s={'Search a domain'} />
          </label>{' '}
          <span style={{ fontSize: 15, color: '#566C78' }} aria-hidden="true">
            <T s={'www.'} />
          </span>{' '}
          <input
            id="dq"
            name="q"
            defaultValue={name}
            placeholder={tx('yourbrand')}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '16px var(--font-inter)', color: '#2B4250', outline: 'none', minHeight: 44 }}
          />{' '}
          <button className="btn" type="submit">
            <T s={'Search domains'} />
          </button>
        </form>
      </TopBand>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14, color: '#3D5563', margin: '0 0 24px' }}>
        {TLDS.slice(0, 6).map(([t, p]) => (
          <span key={t}>
            {t} <b style={{ fontWeight: 500 }}>${p}</b>
          </span>
        ))}
      </div>
      {name && (
        <section className="glass" style={{ padding: 6, marginBottom: 72 }} aria-label={tx('Results')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 20px 6px' }}>
            <h2 style={{ fontSize: 20 }}>
              <T s={'Results for “{name}'} v={{ name }} />
              <span className="caret" aria-hidden="true" />
              &rdquo;
            </h2>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="tag">{registrarLive() ? tx('Live results · first year') : tx('Checked by hand when you order · first year, USD')}</span>
              <button className="btn ghost" type="button" disabled title={tx('A domain cart is coming soon')}>
                <T s={'Domain cart'} />
              </button>
              <span className="status st-draft">
                <T s={'Coming soon'} />
              </span>
            </span>
          </div>
          <div>
            {ALL_TLDS.map(([tld, price]) => (
              <div key={tld} className="res">
                <div style={{ flex: '1 1 220px', fontSize: 17 }}>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span className="muted">{tld}</span>
                </div>
                <span className="status st-draft">
                  <T s={'Checked on order'} />
                </span>
                <div style={{ width: 140, textAlign: 'right' }}>
                  <div style={{ fontWeight: 500 }}>${price}</div>
                  <div className="tag">
                    <T s={'First year'} />
                  </div>
                </div>
                <Link className="btn" href={`/websites?domain=${encodeURIComponent(name + tld)}`} prefetch={false}>
                  <T s={'Use with a website'} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="reveal glass" style={{ padding: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 72 }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{ width: 120, height: 84, borderRadius: 14, background: '#F7FAFB', border: '1px solid #E1EBF0', padding: 10, boxSizing: 'border-box', display: 'flex', gap: 6 }}
            aria-hidden="true"
          >
            <span style={{ width: 22, borderRadius: 4, background: '#EAF1F4' }} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ height: 22, borderRadius: 4, background: '#D3EEE4' }} />
              <span style={{ height: 5, borderRadius: 3, background: '#E1EAEF' }} />
              <span style={{ height: 5, width: '60%', borderRadius: 3, background: '#E1EAEF' }} />
            </span>
          </span>{' '}
          <span style={{ fontSize: 26, color: '#7FBFA9' }} aria-hidden="true">
            +
          </span>{' '}
          <span className="badge" style={{ fontSize: 14, padding: '10px 16px' }}>
            {name ? `${name}${TLDS[0][0]}` : 'yourbrand.com'}
          </span>
        </div>
        <div style={{ flex: '1 1 280px', maxWidth: 460 }}>
          <h2 style={{ fontSize: 26, fontWeight: 300 }}>
            <T s={'Website + domain, ready together'} />
          </h2>
          <p className="muted" style={{ margin: '10px 0 16px', lineHeight: 1.6, fontSize: 15 }}>
            <T s={'Ask for both in one request. The seller connects the domain to your website, so your site is live after review.'} />
          </p>
          <Link className="btn" href="/websites" prefetch={false}>
            <T s={'Pick a website'} />
          </Link>
        </div>
      </section>
      <section className="reveal">
        <h2 style={{ fontSize: 28, marginBottom: 20 }}>
          <T s={'Why buy your domain here'} />
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
          {FEATURES(tx).map(([t, d, paths]) => (
            <div key={t} className="glass feat">
              <span className="ico" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="1.8" strokeLinecap="round">
                  {paths.map((p) => (
                    <path key={p} d={p} />
                  ))}
                </svg>
              </span>
              <div style={{ fontWeight: 500, marginTop: 14 }}>{t}</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>
          <T s={'Domain questions'} />
        </h2>
        <details className="glass" open>
          <summary>
            <T s={'Can I use a domain I already own?'} />
          </summary>
          <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 14 }}>
            <T s={'Yes. Use it with any website you buy here.'} />
          </p>
        </details>
        <details className="glass">
          <summary>
            <T s={'Is the domain refunded if I reject the website?'} />
          </summary>
          <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 14 }}>
            <T s={'{DOMAIN_REFUND_TEXT} The domain stays yours even if you reject the website.'} v={{ DOMAIN_REFUND_TEXT }} />
          </p>
        </details>
      </section>
      <PageExtras path="/domains" />
    </PublicFrame>
  );
}
