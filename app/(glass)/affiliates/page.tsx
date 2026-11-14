import { TopBand } from '@/components/glass/TopBand';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { affSettings, leaderboard } from '@/lib/affiliates/service';
import { COMMISSION_KINDS, joinFeeCents, KIND_LABEL } from '@/lib/affiliates/rules';

import { T } from '@/components/i18n/T';
import type { Tx } from '@/lib/i18n/tx';
import { localizeMetadata } from '@/lib/i18n/seo';
// The page's words in its language; localizeMetadata adds its own address, the other languages and an admin's SEO words for that language.
export const generateMetadata = async (): Promise<Metadata> => {
  const { tx } = await getI18n();
  return localizeMetadata('/affiliates', {
    title: tx('Affiliate Program'),
    description: tx('Share SellOnBay websites and earn a commission on every verified, paid sale. Free to join during the promotion; clear rules, no guaranteed earnings.'),
    alternates: { canonical: '/affiliates' },
  });
};
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const DEFAULT_FAQ = (tx: Tx): [string, string][] => [
  [tx('Does it cost anything to join?'), tx('Not during the promotion. Nothing is ever charged automatically.')],
  [tx('When is a commission paid?'), tx('After the sale is paid, delivered and its refund period has ended. A refunded sale reverses its commission.')],
  [tx('Can I refer myself?'), tx('No. Your own purchases never earn a commission.')],
  [tx('Do I earn for bringing in other affiliates?'), tx('No. Commissions come only from verified sales of websites and subscriptions.')],
  [tx('Are earnings guaranteed?'), tx('No. You earn only when people you refer buy, pay and keep what they bought.')],
];

/*
 * The public affiliate program page (owner, 2026-11-12). Every number comes from Admin › Affiliate Management. While the program is off the
 * page is a 404 for visitors; an admin sees it with a note. The Top 5 shows only affiliates who allow it, ranked by verified, non-refunded sales.
 */
export default async function AffiliatesPage() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  // Public at all times (owner, 2026-11-12): everyone can read about the program. While it is off the page says it opens soon and offers no
  // way to join; registration, link tracking and commissions stay closed on the server either way.
  const [s, i] = await Promise.all([affSettings(), getI18n()]); // words in the page's language (lib/i18n)
  const top = s.enabled && s.leaderboardPublic ? (await leaderboard(undefined, true)).slice(0, 5) : [];
  const fee = joinFeeCents(s);
  const badges = s.badges.filter((b) => b.enabled);
  const faq = s.faq.length ? s.faq.map((x) => [x.q, x.a] as [string, string]) : DEFAULT_FAQ(tx);
  return (
    <PublicFrame file="sell">
      <TopBand eyebrow={i.t('aff.badge')} title={i.t('aff.title')} intro={s.intro || undefined}>
        {s.enabled ? (
          <Link className="btn" href="/dashboard/buyer/affiliate" prefetch={false} style={{ alignSelf: 'flex-start' }}>
            {i.t('aff.join')}
          </Link>
        ) : (
          <span className="status st-draft" style={{ fontSize: 15, padding: '8px 16px', alignSelf: 'flex-start' }}>
            {i.t('aff.soon')}
          </span>
        )}
      </TopBand>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '0 0 24px' }}>
        {!s.enabled && (
          <p className="muted" style={{ margin: 0, maxWidth: 560, fontSize: 14 }}>
            {i.t('aff.soonText')}
          </p>
        )}
        <div className="tag" style={{ margin: 0 }}>
          <T
            s={'{v0} Earnings are not guaranteed.'}
            v={{ v0: fee === 0 ? tx('Free to join during the promotion (normally {usd}).', { usd: usd(s.feeCents) }) : tx('Registration fee {usd}, never charged automatically.', { usd: usd(fee) }) }}
          />
        </div>
      </div>

      {s.benefits.filter((b) => b.on).length > 0 && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>{i.t('aff.benefits')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
            {s.benefits
              .filter((b) => b.on)
              .map((b) => (
                <div key={b.text} className="glass" style={{ padding: 22 }}>
                  {b.text}
                </div>
              ))}
          </div>
        </section>
      )}

      <section className="sec grid2">
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>{i.t('aff.rates')}</h2>
          <div className="tbl">
            <table>
              <tbody>
                {COMMISSION_KINDS.filter((k) => s.kindsEnabled[k]).map((k) => (
                  <tr key={k}>
                    <td>{KIND_LABEL[k]}</td>
                    <td style={{ textAlign: 'right' }}>{pct(s.rates[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tag">
            <T s={'On the eligible net amount: what the buyer paid less refunds, without taxes, domains or hosting.'} />
          </div>
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>{i.t('aff.qualification')}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            <T s={'New affiliates start as'} />{' '}
            <b>
              <T s={'Qualification pending'} />
            </b>{' '}
            <T
              s={'and can share links and earn straight away. Reach {targetSales} verified, paid, non-refunded sales within {qualificationDays} days to become a'}
              v={{ targetSales: s.targetSales, qualificationDays: s.qualificationDays }}
            />{' '}
            <b style={{ color: '#1A8F5C' }}>
              <T s={'SellOnBay Verified Affiliate'} />
            </b>
            <T
              s={'{v0}. If you do not reach it, nothing is charged; your account stays pending and we may extend or restart the window.'}
              v={{ v0: s.waiveFeeOnQualify ? ' and the registration fee is waived for good' : '' }}
            />
          </p>
        </div>
      </section>

      <section className="sec">
        <h2 style={{ fontSize: 28, marginBottom: 18 }}>{i.t('aff.how')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 16 }}>
          {[
            ['Join', 'Use your SellOnBay account; no new account is needed.'],
            ['Share', tx('Copy a link for any website, or a general link, from your dashboard.')],
            ['Track', `A visit through your link is remembered for ${s.cookieDays} days in browsers that accept cookies.`],
            ['Earn', tx('Commissions are approved {holdDays} days after the sale is accepted, and refunds reverse them.', { holdDays: s.holdDays })],
            ['Withdraw', tx('Ask for a payout from {usd}; every payout is checked and paid by hand.', { usd: usd(s.minWithdrawalCents) })],
          ].map(([t, d], i) => (
            <div key={t} className="glass" style={{ padding: 22 }}>
              <div style={{ fontWeight: 500 }}>
                {i + 1}. {t}
              </div>
              <div className="muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.55 }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </section>

      {badges.length > 0 && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>{i.t('aff.badges')}</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {badges.map((b) => (
              <span key={b.key} className="status" style={{ background: b.color, color: '#fff' }} title={b.reward || undefined}>
                {b.icon} {b.name}
              </span>
            ))}
          </div>
          <div className="tag">
            <T s={'Badges count verified, non-refunded sales only, and are adjusted if a sale is later refunded.'} />
          </div>
        </section>
      )}

      {s.enabled && s.leaderboardPublic && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>
            <T s={"This month's top 5"} />
          </h2>
          <div className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Rank'} />
                    </th>
                    <th>
                      <T s={'Affiliate'} />
                    </th>
                    <th>
                      <T s={'Verified sales'} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {top.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        <T s={'No verified sales yet this month.'} />
                      </td>
                    </tr>
                  )}
                  {top.map((r) => (
                    <tr key={r.affiliateId}>
                      <td>{r.rank === 1 ? '♛ 1' : r.rank}</td>
                      <td>
                        {r.name}{' '}
                        {r.qualified && (
                          <span className="status st-ok" style={{ marginLeft: 6 }}>
                            <T s={'✓ Verified'} />
                          </span>
                        )}
                        {r.rank === 1 && (
                          <span className="tag">
                            {' '}
                            <T s={'· Monthly champion so far'} />
                          </span>
                        )}
                      </td>
                      <td>{r.sales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="tag">
            <T s={'Ranked by verified, non-refunded sales, then eligible net revenue. Affiliates can choose not to appear here.'} />
          </div>
        </section>
      )}

      <section className="sec grid2">
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>{i.t('aff.payments')}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            <T
              s={
                'Sale paid → refund period over → commission approved → available balance → you ask for a withdrawal (from {v0}) → we check it → we pay by hand and record the reference. A balance is never shown as paid before it is.'
              }
              v={{ v0: usd(s.minWithdrawalCents) }}
            />
          </p>
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>{i.t('aff.privacy')}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            <T
              s={
                "A referral is remembered only in browsers that accepted analytics cookies, for {cookieDays} days. We count clicks without storing who clicked, and affiliates never see buyers' names or details. See the"
              }
              v={{ cookieDays: s.cookieDays }}
            />{' '}
            <Link href="/legal/privacy">
              <T s={'privacy policy'} />
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="sec">
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>{i.t('aff.terms')}</h2>
        <div className="glass card" style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {s.terms}
          <div className="tag">
            <T s={'Version {termsVersion}. You accept the version shown when you join.'} v={{ termsVersion: s.termsVersion }} />
          </div>
        </div>
      </section>

      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>{i.t('aff.questions')}</h2>
        {faq.map(([q, a]) => (
          <details key={q} className="glass">
            <summary>{q}</summary>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6 }}>
              {a}
            </p>
          </details>
        ))}
      </section>
    </PublicFrame>
  );
}
