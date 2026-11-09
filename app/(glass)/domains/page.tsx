import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { CONFIG, DOMAIN_REFUND_TEXT } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { ALL_TLDS, cleanName, registrarLive, TLDS } from '@/lib/domains';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const generateMetadata = () => pageMetadata('/domains', { alternates: { canonical: '/domains' } });

const FEATURES: [string, string, string[]][] = [
  ['In your own name', 'You are the registered owner. Sellers never hold your domain.', ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6']],
  ['Help connecting it', 'We help you point the domain at your new website.', ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']],
  ['Checked by a person', 'We check the name with the registrar by hand before anything is registered.', ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z']],
  ['Renewal reminders', `We email you ${CONFIG.domain.reminderDays.join(', ')} days before it expires.`, ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2']],
];

/*
 * design-reference/domains.html. No registrar is connected (owner, 2026-11-07): registration is done by hand, so this page never says a name is
 * free. It shows the endings and prices (lib/domains.ts), and a name goes on with a website (the domain step of the request). When a registrar is
 * connected, `registrarLive` turns into real answers here. Refund wording: owner, 2026-11-09.
 */
export default async function Domains({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const name = cleanName(String(q));
  const [words, copy] = await Promise.all([pageWords('/domains'), pageCopy('domains')]);
  const heading = copy.t('head', 'heading', words.heading);
  const intro = copy.t('head', 'intro', words.intro ?? '');
  const cut = heading.search(/\s+for\s/i);
  const [h1a, h1b] = cut > 0 ? [heading.slice(0, cut), heading.slice(cut + 1)] : [heading, ''];
  return (
    <PublicFrame file="domains">
      <section style={{ padding: '88px 0 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
        <span className="badge fade-in" style={{ animationDelay: '.2s' }}>
          Registered in your own name
        </span>
        <h1 style={{ fontSize: 'clamp(38px, 5.5vw, 60px)', lineHeight: 1.08, fontWeight: 300 }}>
          <span className="hl">
            <span style={{ animationDelay: '.25s' }}>{h1a}</span>
          </span>
          {h1b && (
            <>
              {' '}
              <span className="hl">
                <span style={{ animationDelay: '.42s' }}>{h1b}</span>
              </span>
            </>
          )}
        </h1>
        {intro && (
          <p className="muted fade-in" style={{ margin: 0, maxWidth: 560, fontSize: 17, lineHeight: 1.6, animationDelay: '.5s' }}>
            {intro}
          </p>
        )}
        <form
          className="glass search-glow"
          action="/domains"
          method="get"
          role="search"
          style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 700, padding: '8px 8px 8px 22px', borderRadius: 999, boxSizing: 'border-box', marginTop: 8 }}
        >
          <label htmlFor="dq" className="hidden-label">
            Search a domain
          </label>{' '}
          <span style={{ fontSize: 15, color: '#566C78' }} aria-hidden="true">
            www.
          </span>{' '}
          <input
            id="dq"
            name="q"
            defaultValue={name}
            placeholder="yourbrand"
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', font: '16px var(--font-inter)', color: '#2B4250', outline: 'none', minHeight: 44 }}
          />{' '}
          <button className="btn" type="submit">
            Search domains
          </button>
        </form>
        <div className="fade-in" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', fontSize: 14, color: '#3D5563', animationDelay: '.75s' }}>
          {TLDS.slice(0, 6).map(([t, p]) => (
            <span key={t}>
              {t} <b style={{ fontWeight: 500 }}>${p}</b>
            </span>
          ))}
        </div>
      </section>
      {name && (
        <section className="glass" style={{ padding: 6, marginBottom: 72 }} aria-label="Results">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '16px 20px 6px' }}>
            <h2 style={{ fontSize: 20 }}>
              Results for &ldquo;{name}
              <span className="caret" aria-hidden="true" />
              &rdquo;
            </h2>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="tag">{registrarLive() ? 'Live results · first year' : 'Checked by hand when you order · first year, USD'}</span>
              <Link className="btn ghost" href="/cart" prefetch={false}>
                View cart
              </Link>
            </span>
          </div>
          <div>
            {ALL_TLDS.map(([tld, price]) => (
              <div key={tld} className="res">
                <div style={{ flex: '1 1 220px', fontSize: 17 }}>
                  <span style={{ fontWeight: 500 }}>{name}</span>
                  <span className="muted">{tld}</span>
                </div>
                <span className="status st-draft">Checked on order</span>
                <div style={{ width: 140, textAlign: 'right' }}>
                  <div style={{ fontWeight: 500 }}>${price}</div>
                  <div className="tag">First year</div>
                </div>
                <Link className="btn" href={`/websites?domain=${encodeURIComponent(name + tld)}`} prefetch={false}>
                  Use with a website
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
          <h2 style={{ fontSize: 26, fontWeight: 300 }}>Website + domain, ready together</h2>
          <p className="muted" style={{ margin: '10px 0 16px', lineHeight: 1.6, fontSize: 15 }}>
            Ask for both in one request. The seller connects the domain to your website, so your site is live after review.
          </p>
          <Link className="btn" href="/websites" prefetch={false}>
            Pick a website
          </Link>
        </div>
      </section>
      <section className="reveal">
        <h2 style={{ fontSize: 28, marginBottom: 20 }}>Why buy your domain here</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {FEATURES.map(([t, d, paths]) => (
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
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Domain questions</h2>
        <details className="glass" open>
          <summary>Can I use a domain I already own?</summary>
          <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 14 }}>
            Yes. Use it with any website you buy here.
          </p>
        </details>
        <details className="glass">
          <summary>Is the domain refunded if I reject the website?</summary>
          <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 14 }}>
            {DOMAIN_REFUND_TEXT} The domain stays yours even if you reject the website.
          </p>
        </details>
      </section>
      <PageExtras path="/domains" />
    </PublicFrame>
  );
}
