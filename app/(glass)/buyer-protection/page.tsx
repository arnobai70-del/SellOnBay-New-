import Link from 'next/link';
import { PageExtras } from '@/components/PageExtras';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { BUGFIX_DAYS, PAYOUT_TEXT, REVIEW_HOURS } from '@/lib/config';
import { pageCopy } from '@/lib/content/copy';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('/buyer-protection', { alternates: { canonical: '/buyer-protection' } });

const STEPS = [
  ['Try the live demo', 'Click through every page before you buy.'],
  ['Pay into escrow', 'SellOnBay holds the money, not the seller. In the beta nothing is charged.'],
  ['Get files + domain', 'Download code, database and setup guide. Domain in your name.'],
  [`Review for ${REVIEW_HOURS} hours`, 'Report a problem and the seller gets a deadline to fix it.'],
  ['Approve', 'The seller is paid and the website is yours.'],
];

/*
 * design-reference/buyer-protection.html. The heading and intro come from Admin › Content › Pages (pageCopy), else the page's own words; the
 * numbers (review hours, bug-fix days, payout day) from lib/config.ts.
 */
export default async function BuyerProtection() {
  const [words, copy] = await Promise.all([pageWords('/buyer-protection'), pageCopy('buyer-protection')]);
  const heading = copy.t('head', 'heading', words.heading);
  const intro = copy.t('head', 'intro', words.intro ?? '');
  const [first, ...rest] = heading.split(/(?<=\.)\s+/);
  return (
    <PublicFrame file="buyer-protection">
      <header className="pagehead" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 80 }}>
        <span className="badge fade-in">Buyer protection</span>
        <h1>
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
          <p className="muted fade-in" style={{ margin: 0, maxWidth: 620, lineHeight: 1.6, animationDelay: '.3s' }}>
            {intro}
          </p>
        )}
      </header>
      <section className="sec" style={{ paddingTop: 32 }}>
        <h2 style={{ fontSize: 28, marginBottom: 18 }}>How buying works</h2>
        <div className="tl">
          {STEPS.map(([t, d], i) => (
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
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>What&apos;s covered</h2>
          {[
            "The website doesn't match its live demo",
            'Files, database or setup guide are missing',
            "It doesn't run after following the setup guide",
            "The seller doesn't reply to a reported problem",
            `A dispute for a serious problem for ${BUGFIX_DAYS} days after you accept, and a ${BUGFIX_DAYS}-day bug-fix guarantee`,
          ].map((t) => (
            <div key={t} className="yes">
              <i aria-hidden="true">✓</i> {t}
            </div>
          ))}
          <div className="tag">
            Exact rules: <Link href="/legal/refunds">Refund policy</Link>
          </div>
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>What&apos;s not covered</h2>
          {[
            'Changing your mind after you approve',
            'Problems caused by your own code changes',
            'Your hosting bills or third-party services',
            'New features the demo never had (ask for a customization instead)',
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
            <h2 style={{ fontSize: 26, fontWeight: 300 }}>If something goes wrong</h2>
            <p className="muted" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
              Open a ticket from your dashboard. The seller gets a deadline to fix it, and our support team steps in if you can&apos;t agree. Your money stays in escrow the whole time.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="btn" href="/dashboard/buyer/support?new=1" prefetch={false}>
              Open a ticket
            </Link>
            <Link className="btn ghost" href="/help" prefetch={false}>
              Help center
            </Link>
          </div>
        </div>
      </section>
      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Questions</h2>
        {[
          ['When exactly is the seller paid?', `After you approve, or ${REVIEW_HOURS} hours after delivery if no problem was reported. ${PAYOUT_TEXT}.`],
          ['Do I pay extra for escrow?', 'No. It is included in every website order.'],
          ['How do I pay by bank or wallet?', 'Enter the reference at checkout when live payments open. We check it against the statement, then the order starts.'],
          ['Who owns the domain?', "You do. It is registered in your name, never the seller's."],
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
