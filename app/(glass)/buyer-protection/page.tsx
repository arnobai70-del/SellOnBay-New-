import { TopBand } from '@/components/glass/TopBand';
import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { BUGFIX_DAYS, PAYOUT_TEXT, REVIEW_HOURS } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const revalidate = 300;
export const generateMetadata = () => pageMetadata('/buyer-protection', { alternates: { canonical: '/buyer-protection' } });

const STEPS = (tx: Tx) => [
  [tx('Try the live demo'), tx('Click through every page before you buy.')],
  [tx('Pay into escrow'), 'SellOnBay holds the money, not the seller. In the beta nothing is charged.'],
  [tx('Get files + domain'), tx('Download code, database and setup guide. Domain in your name.')],
  [tx('Review for {REVIEW_HOURS} hours', { REVIEW_HOURS }), tx('Report a problem and the seller gets a deadline to fix it.')],
  ['Approve', tx('The seller is paid and the website is yours.')],
];

/*
 * design-reference/buyer-protection.html. The heading and intro come from Admin › Content › Pages (pageCopy), else the page's own words; the
 * numbers (review hours, bug-fix days, payout day) from lib/config.ts.
 */
export default async function BuyerProtection() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [words, copy] = await Promise.all([pageWords('/buyer-protection'), pageCopy('buyer-protection')]);
  const heading = copy.t('head', 'heading', words.heading);
  const intro = copy.t('head', 'intro', words.intro ?? '');
  return (
    <PublicFrame file="buyer-protection">
      <TopBand eyebrow={<T s={'Buyer protection'} />} title={heading} intro={intro || undefined} />
      <section className="sec" style={{ paddingTop: 32 }}>
        <h2 style={{ fontSize: 28, marginBottom: 18 }}>
          <T s={'How buying works'} />
        </h2>
        <div className="tl">
          {STEPS(tx).map(([t, d], i) => (
            <div key={t} className="glass st">
              <span className="n">{i + 1}</span>
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
            <T s={"What's covered"} />
          </h2>
          {[
            tx("The website doesn't match its live demo"),
            tx('Files, database or setup guide are missing'),
            tx("It doesn't run after following the setup guide"),
            tx("The seller doesn't reply to a reported problem"),
            `A dispute for a serious problem for ${BUGFIX_DAYS} days after you accept, and a ${BUGFIX_DAYS}-day bug-fix guarantee`,
          ].map((t) => (
            <div key={t} className="yes">
              <i aria-hidden="true">✓</i> {t}
            </div>
          ))}
          <div className="tag">
            <T s={'Exact rules:'} />{' '}
            <Link href="/legal/refunds">
              <T s={'Refund policy'} />
            </Link>
          </div>
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>
            <T s={"What's not covered"} />
          </h2>
          {[
            tx('Changing your mind after you approve'),
            tx('Problems caused by your own code changes'),
            tx('Your hosting bills or third-party services'),
            tx('New features the demo never had (ask for a customization instead)'),
          ].map((t) => (
            <div key={t} className="no">
              <i aria-hidden="true">–</i> {t}
            </div>
          ))}
        </div>
      </section>
      <section className="sec">
        <div className="glass card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 360px' }}>
            <h2 style={{ fontSize: 26, fontWeight: 300 }}>
              <T s={'If something goes wrong'} />
            </h2>
            <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
              <T s={"Open a ticket from your dashboard. The seller gets a deadline to fix it, and our support team steps in if you can't agree. Your money stays in escrow the whole time."} />
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" href="/dashboard/buyer/support?new=1" prefetch={false}>
              <T s={'Open a ticket'} />
            </Link>
            <Link className="btn ghost" href="/help" prefetch={false}>
              <T s={'Help center'} />
            </Link>
          </div>
        </div>
      </section>
      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>
          <T s={'Questions'} />
        </h2>
        {[
          [tx('When exactly is the seller paid?'), tx('After you approve, or {REVIEW_HOURS} hours after delivery if no problem was reported. {PAYOUT_TEXT}.', { REVIEW_HOURS, PAYOUT_TEXT })],
          [tx('Do I pay extra for escrow?'), tx('No. It is included in every website order.')],
          [tx('How do I pay by bank or wallet?'), tx('Enter the reference at checkout when live payments open. We check it against the statement, then the order starts.')],
          [tx('Who owns the domain?'), tx("You do. It is registered in your name, never the seller's.")],
        ].map(([q, a], i) => (
          <details key={q} className="glass" open={i === 0}>
            <summary>{q}</summary>
            <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6, fontSize: 14 }}>
              {a}
            </p>
          </details>
        ))}
      </section>
      <PageExtras path="/buyer-protection" />
    </PublicFrame>
  );
}
