import { Button } from '@/components/glass/Button';
import { pageCopy } from '@/lib/content/copy';
import { GlassCard } from '@/components/glass/GlassCard';
import { Earnings } from './Earnings';
import { PageExtras } from '@/components/PageExtras';
import { CONFIG, PAYOUT_FEE_TEXT, PAYOUT_TEXT, PLAN_FEE_TEXT, PLAN_KEEP_TEXT, REVIEW_HOURS } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { SocialRow } from '@/components/glass/SocialRow';
import { savedSocial } from '@/lib/site/contentStore';

export const generateMetadata = () => pageMetadata('/sell', { alternates: { canonical: '/sell' } });

const MIN = CONFIG.sale.priceMinCents / 100;
const STEPS = [
  ['Create an account', 'Free. One account can buy and sell.'],
  ['Verify your identity', 'A passport, national ID or driver licence, once, before your first payout.'],
  ['Upload your website', 'Code, database, demo link, screenshots and setup guide.'],
  ['We review it', 'A person checks it, and tells you exactly what to fix if something is missing.'],
  ['Sell and get paid', `${PAYOUT_TEXT}.`],
];
const CHECKS = [
  'A working live demo',
  'Frontend and backend source files',
  'Database schema (and seed data if needed)',
  'A setup guide a buyer can follow',
  `Price of at least $${MIN}`,
  'Your own work, no copied brands or code',
];

export default async function Sell() {
  const [words, social] = await Promise.all([pageWords('/sell'), savedSocial()]);
  const copy = await pageCopy('sell'); // Admin › Content › Pages; empty fields keep the page's own words
  return (
    <>
      <div className="g-head">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        {copy.t('head', 'intro', words.intro ?? '') && <p className="g-lead">{copy.t('head', 'intro', words.intro ?? '')}</p>}
        <div className="g-row" style={{ justifyContent: 'flex-start' }}>
          <Button href="/signin?mode=signup" data-track="start-selling">
            {copy.t('cta', 'start')}
          </Button>
          <Button variant="ghost" href="/legal/seller-agreement">
            {copy.t('cta', 'agreement')}
          </Button>
        </div>
      </div>
      <Earnings />
      <section className="g-sec">
        <h2>From upload to payout</h2>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {STEPS.map(([t, d], i) => (
            <GlassCard key={t} reveal>
              <span className="g-step-n">{i + 1}</span>
              <h3>{t}</h3>
              <p className="g-muted" style={{ marginTop: 6, fontSize: 14 }}>
                {d}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>
      <section className="g-sec g-grid2">
        <GlassCard reveal>
          <h2>What we check before going live</h2>
          <ul className="g-list">
            {CHECKS.map((c) => (
              <li key={c}>✓ {c}</li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard reveal>
          <h2>Fees, simply</h2>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>Listing a website</span>Free
          </div>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>Your share of each sale</span>
            {PLAN_KEEP_TEXT}
          </div>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>SellOnBay share</span>
            {PLAN_FEE_TEXT}
          </div>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>Custom work through SellOnBay</span>
            {PLAN_KEEP_TEXT} to you
          </div>
          <div className="g-li">
            <span style={{ flex: 1, fontSize: 14 }}>Payout fee</span>None from SellOnBay
          </div>
          <p className="g-tag" style={{ marginTop: 10 }}>
            {PAYOUT_FEE_TEXT}
          </p>
          <p className="g-tag" style={{ marginTop: 10 }}>
            {PAYOUT_TEXT}, after the buyer&apos;s {REVIEW_HOURS}-hour review. By PayPal, Payoneer, Wise or bank transfer worldwide.
          </p>
        </GlassCard>
      </section>
      <section className="g-sec">
        <GlassCard reveal className="g-row">
          <h2>{copy.t('cta', 'ready')}</h2>
          <Button href="/signin?mode=signup" data-track="start-selling">
            {copy.t('cta', 'create')}
          </Button>
        </GlassCard>
        <SocialRow links={social} label="Sellers community" />
      </section>
      <PageExtras path="/sell" />
    </>
  );
}
