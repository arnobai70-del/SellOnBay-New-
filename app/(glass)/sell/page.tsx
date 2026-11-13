import Link from 'next/link';
import { Earnings } from './Earnings';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { SocialRow } from '@/components/glass/SocialRow';
import { CONFIG, PAYOUT_FEE_TEXT, PAYOUT_TEXT, PLAN_FEE_TEXT, PLAN_KEEP_TEXT, REVIEW_HOURS } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { savedSocial } from '@/lib/site/contentStore';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const revalidate = 300;
export const generateMetadata = () => pageMetadata('/sell', { alternates: { canonical: '/sell' } });

const MIN = CONFIG.sale.priceMinCents / 100;
const STEPS = (tx: Tx) => [
  [tx('Create an account'), tx('Free. Switch between buying and selling any time.')],
  [tx('Verify your identity'), 'A passport, national ID or driver licence, once, before your first payout.'],
  [tx('Upload your website'), tx('Code, database, demo link, screenshots and setup guide.')],
  [tx('We review it'), 'A person checks it, and tells you exactly what to fix if something is missing.'],
  [tx('Sell and get paid'), tx('Money is released after review. {PAYOUT_TEXT}.', { PAYOUT_TEXT })],
];
const CHECKS = (tx: Tx) => [
  'A working live demo',
  tx('Frontend and backend source files'),
  tx('Database schema (and seed data if needed)'),
  'A setup guide a buyer can follow',
  tx('Price of at least ${MIN}', { MIN }),
  tx('Your own work, no copied brands or code'),
];
const NUM: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  background: '#CDEBDF',
  color: '#1A5444',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 500,
};

/*
 * design-reference/sell.html. Heading, intro and buttons come from Admin › Content › Pages (pageCopy), else the page's own words; every figure
 * from lib/config.ts (owner, 2026-11-07: seller 78%, platform 22%, $20 minimum). Payout fee wording: owner, 2026-11-09.
 */
export default async function Sell() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [words, social, copy] = await Promise.all([pageWords('/sell'), savedSocial(), pageCopy('sell')]);
  const heading = copy.t('head', 'heading', words.heading);
  const intro = copy.t('head', 'intro', words.intro ?? '');
  const [first, ...rest] = heading.split(/(?<=\.)\s+/);
  return (
    <PublicFrame file="sell">
      <section style={{ padding: '80px 0 24px', display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 440px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span className="badge fade-in" style={{ alignSelf: 'flex-start' }}>
            <T s={'For developers'} />
          </span>
          <h1 style={{ fontSize: 'clamp(38px,5vw,58px)', fontWeight: 300, lineHeight: 1.08 }}>
            <span className="hl">
              <span>{first}</span>
            </span>
            {rest.length > 0 && (
              <>
                {' '}
                <span className="hl">
                  <span style={{ animationDelay: '.15s' }}>{rest.join(' ')}</span>
                </span>
              </>
            )}
          </h1>
          {intro && (
            <p className="muted fade-in" style={{ margin: 0, maxWidth: 520, lineHeight: 1.6, fontSize: 17, animationDelay: '.3s' }}>
              {intro}
            </p>
          )}
          <div className="fade-in" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', animationDelay: '.4s' }}>
            <Link className="btn" href="/signin?mode=signup" data-track="start-selling">
              {copy.t('cta', 'start')}
            </Link>
            <Link className="btn ghost" href="/legal/seller-agreement" prefetch={false}>
              {copy.t('cta', 'agreement')}
            </Link>
          </div>
        </div>
        <Earnings />
      </section>
      <section className="sec" id="how">
        <h2 style={{ fontSize: 28, marginBottom: 18 }}>
          <T s={'From upload to payout'} />
        </h2>
        <div className="grid3">
          {STEPS(tx).map(([t, d], i) => (
            <div key={t} className="glass card">
              <div style={NUM}>{i + 1}</div>
              <div style={{ fontWeight: 500, marginTop: 14 }}>{t}</div>
              <div className="muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="sec grid2">
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>
            <T s={'What we check before going live'} />
          </h2>
          {CHECKS(tx).map((c) => (
            <div key={c} className="rq">
              <i aria-hidden="true">✓</i> {c}
            </div>
          ))}
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>
            <T s={'Fees, simply'} />
          </h2>
          <div className="tbl">
            <table>
              <tbody>
                {(
                  [
                    [tx('Listing a website'), 'Free'],
                    [tx('Your share of each sale'), PLAN_KEEP_TEXT],
                    ['SellOnBay share', PLAN_FEE_TEXT],
                    [tx('Custom work through SellOnBay'), `${PLAN_KEEP_TEXT} to you`],
                    [tx('Payout fee'), tx('None from SellOnBay')],
                  ] as const
                ).map(([l, v]) => (
                  <tr key={l}>
                    <td>{l}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tag">{PAYOUT_FEE_TEXT}</div>
          <div className="tag">
            <T s={"{PAYOUT_TEXT}, after the buyer's {REVIEW_HOURS}-hour review. By PayPal, Payoneer, Wise or bank transfer worldwide."} v={{ PAYOUT_TEXT, REVIEW_HOURS }} />
          </div>
        </div>
      </section>
      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>
          <T s={'Seller questions'} />
        </h2>
        {[
          [tx('What do I need to start?'), tx('An account, an identity document for verification, and a payout account (PayPal, Payoneer, Wise or a bank).')],
          [tx('How long does review take?'), tx('A person checks every website. If something is missing, the reviewer tells you exactly what to fix.')],
          [tx('What if a buyer reports a problem?'), tx('You get a message and a deadline to help. Payment is released once it is solved.')],
        ].map(([q, a], i) => (
          <details key={q} className="glass" open={i === 0}>
            <summary>{q}</summary>
            <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 14 }}>
              {a}
            </p>
          </details>
        ))}
      </section>
      <section className="sec">
        <div className="glass card" style={{ padding: 44, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 32, fontWeight: 300 }}>{copy.t('cta', 'ready')}</h2>
          <Link className="btn" href="/signin?mode=signup" data-track="start-selling">
            {copy.t('cta', 'create')}
          </Link>
        </div>
        <SocialRow links={social} label={tx('Sellers community')} />
      </section>
      <PageExtras path="/sell" />
    </PublicFrame>
  );
}
