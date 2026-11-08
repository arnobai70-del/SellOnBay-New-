import Link from 'next/link';
import { pageCopy } from '@/lib/content/copy';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { PageExtras } from '@/components/PageExtras';
import { BUGFIX_DAYS, PAYOUT_TEXT, REVIEW_HOURS } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const generateMetadata = () => pageMetadata('/buyer-protection', { alternates: { canonical: '/buyer-protection' } });

const STEPS = [
  ['Try the live demo', 'Click through every page before you buy.'],
  ['Pay into escrow', 'SellOnBay holds the money, not the seller.'],
  ['Get files and domain', 'Download code, database and setup guide. Domain in your name.'],
  [`Review for ${REVIEW_HOURS} hours`, 'Report a problem and the seller gets a deadline to fix it.'],
  ['Approve', 'The seller is paid and the website is yours.'],
];

export default async function BuyerProtection() {
  const words = await pageWords('/buyer-protection');
  const copy = await pageCopy('buyer-protection'); // Admin › Content › Pages; empty fields keep the page's own words
  return (
    <>
      <div className="g-head">
        <h1>{copy.t('head', 'heading', words.heading)}</h1>
        {copy.t('head', 'intro', words.intro ?? '') && <p className="g-lead">{copy.t('head', 'intro', words.intro ?? '')}</p>}
      </div>
      <section>
        <h2>How buying works</h2>
        <div className="g-grid3" style={{ marginTop: 18 }}>
          {STEPS.map(([t, d], i) => (
            <GlassCard key={t}>
              <span className="g-step-n">{i + 1}</span>
              <h3>{t}</h3>
              <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
                {d}
              </p>
            </GlassCard>
          ))}
        </div>
      </section>
      <section className="g-sec grid2">
        <GlassCard reveal>
          <h2>What&apos;s covered</h2>
          <ul className="g-list">
            <li>✓ The website doesn&apos;t match its live demo</li>
            <li>✓ Files, database or setup guide are missing</li>
            <li>✓ It doesn&apos;t run after following the setup guide</li>
            <li>✓ The seller doesn&apos;t reply to a reported problem</li>
            <li>
              ✓ A dispute for a serious problem for {BUGFIX_DAYS} days after you accept, and a {BUGFIX_DAYS}-day bug-fix guarantee
            </li>
          </ul>
          <p className="tag" style={{ marginTop: 10 }}>
            Exact rules: <Link href="/legal/refunds">Refund policy</Link>
          </p>
        </GlassCard>
        <GlassCard reveal>
          <h2>What&apos;s not covered</h2>
          <ul className="g-list">
            <li>– Changing your mind after you approve</li>
            <li>– Problems caused by your own code changes</li>
            <li>– Your hosting bills or third-party services</li>
            <li>– New features the demo never had (ask for a customization instead)</li>
          </ul>
        </GlassCard>
      </section>
      <section className="g-sec">
        <GlassCard reveal>
          <h2>If something goes wrong</h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Open a ticket from your dashboard. The seller gets a deadline to fix it, and our support team steps in if you can&apos;t agree. Your money stays in escrow the whole time.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button variant="ghost" href="/help">
              Help center
            </Button>
          </div>
        </GlassCard>
      </section>
      <section className="g-sec">
        <GlassCard reveal>
          <h2>Questions</h2>
          {[
            ['When exactly is the seller paid?', `After you approve, or ${REVIEW_HOURS} hours after delivery if no problem was reported. ${PAYOUT_TEXT}.`],
            ['Do I pay extra for escrow?', 'No. It is included in every website order.'],
            ['Who owns the domain?', "You do. It is registered in your name, never the seller's."],
          ].map(([q, a]) => (
            <div key={q} className="li" style={{ display: 'block' }}>
              <b style={{ fontWeight: 500, fontSize: 14 }}>{q}</b>
              <p className="muted" style={{ marginTop: 4, fontSize: 14 }}>
                {a}
              </p>
            </div>
          ))}
        </GlassCard>
      </section>
      <PageExtras path="/buyer-protection" />
    </>
  );
}
