import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { affSettings, leaderboard } from '@/lib/affiliates/service';
import { COMMISSION_KINDS, joinFeeCents, KIND_LABEL } from '@/lib/affiliates/rules';

export const metadata: Metadata = {
  title: 'Affiliate Program',
  description: 'Share SellOnBay websites and earn a commission on every verified, paid sale. Free to join during the promotion; clear rules, no guaranteed earnings.',
  alternates: { canonical: '/affiliates' },
};
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const DEFAULT_FAQ: [string, string][] = [
  ['Does it cost anything to join?', 'Not during the promotion. Nothing is ever charged automatically.'],
  ['When is a commission paid?', 'After the sale is paid, delivered and its refund period has ended. A refunded sale reverses its commission.'],
  ['Can I refer myself?', 'No. Your own purchases never earn a commission.'],
  ['Do I earn for bringing in other affiliates?', 'No. Commissions come only from verified sales of websites and subscriptions.'],
  ['Are earnings guaranteed?', 'No. You earn only when people you refer buy, pay and keep what they bought.'],
];

/*
 * The public affiliate program page (owner, 2026-11-12). Every number comes from Admin › Affiliate Management. While the program is off the
 * page is a 404 for visitors; an admin sees it with a note. The Top 5 shows only affiliates who allow it, ranked by verified, non-refunded sales.
 */
export default async function AffiliatesPage() {
  // Public at all times (owner, 2026-11-12): everyone can read about the program. While it is off the page says it opens soon and offers no
  // way to join; registration, link tracking and commissions stay closed on the server either way.
  const s = await affSettings();
  const top = s.enabled && s.leaderboardPublic ? (await leaderboard(undefined, true)).slice(0, 5) : [];
  const fee = joinFeeCents(s);
  const badges = s.badges.filter((b) => b.enabled);
  const faq = s.faq.length ? s.faq.map((x) => [x.q, x.a] as [string, string]) : DEFAULT_FAQ;
  return (
    <PublicFrame file="sell">
      <section style={{ padding: '72px 0 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span className="badge">Affiliate Program</span>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 300 }}>Share websites you like. Earn on every verified sale.</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
          {s.intro}
        </p>
        {s.enabled ? (
          <Link className="btn" href="/dashboard/buyer/affiliate" prefetch={false}>
            Join the affiliate program
          </Link>
        ) : (
          <span className="status st-draft" style={{ fontSize: 15, padding: '8px 16px' }}>
            Opening soon
          </span>
        )}
        {!s.enabled && (
          <p className="muted" style={{ margin: 0, maxWidth: 560, fontSize: 14 }}>
            The SellOnBay affiliate program is not open for registration yet. Everything below is how it will work; check back soon.
          </p>
        )}
        <div className="tag">
          {fee === 0 ? `Free to join during the promotion (normally ${usd(s.feeCents)}).` : `Registration fee ${usd(fee)}, never charged automatically.`} Earnings are not guaranteed.
        </div>
      </section>

      {s.benefits.filter((b) => b.on).length > 0 && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>Benefits</h2>
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
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Commission rates</h2>
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
          <div className="tag">On the eligible net amount: what the buyer paid less refunds, without taxes, domains or hosting.</div>
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Qualification</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            New affiliates start as <b>Qualification pending</b> and can share links and earn straight away. Reach {s.targetSales} verified, paid, non-refunded sales within {s.qualificationDays} days
            to become a <b style={{ color: '#1A8F5C' }}>SellOnBay Verified Affiliate</b>
            {s.waiveFeeOnQualify ? ' and the registration fee is waived for good' : ''}. If you do not reach it, nothing is charged; your account stays pending and we may extend or restart the window.
          </p>
        </div>
      </section>

      <section className="sec">
        <h2 style={{ fontSize: 28, marginBottom: 18 }}>How it works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 16 }}>
          {[
            ['Join', 'Use your SellOnBay account; no new account is needed.'],
            ['Share', 'Copy a link for any website, or a general link, from your dashboard.'],
            ['Track', `A visit through your link is remembered for ${s.cookieDays} days in browsers that accept cookies.`],
            ['Earn', `Commissions are approved ${s.holdDays} days after the sale is accepted, and refunds reverse them.`],
            ['Withdraw', `Ask for a payout from ${usd(s.minWithdrawalCents)}; every payout is checked and paid by hand.`],
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
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>Badges</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {badges.map((b) => (
              <span key={b.key} className="status" style={{ background: b.color, color: '#fff' }} title={b.reward || undefined}>
                {b.icon} {b.name}
              </span>
            ))}
          </div>
          <div className="tag">Badges count verified, non-refunded sales only, and are adjusted if a sale is later refunded.</div>
        </section>
      )}

      {s.enabled && s.leaderboardPublic && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>This month&apos;s top 5</h2>
          <div className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Affiliate</th>
                    <th>Verified sales</th>
                  </tr>
                </thead>
                <tbody>
                  {top.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No verified sales yet this month.
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
                            ✓ Verified
                          </span>
                        )}
                        {r.rank === 1 && <span className="tag"> · Monthly champion so far</span>}
                      </td>
                      <td>{r.sales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="tag">Ranked by verified, non-refunded sales, then eligible net revenue. Affiliates can choose not to appear here.</div>
        </section>
      )}

      <section className="sec grid2">
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Payments and withdrawals</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            Sale paid → refund period over → commission approved → available balance → you ask for a withdrawal (from {usd(s.minWithdrawalCents)}) → we check it → we pay by hand and record the
            reference. A balance is never shown as paid before it is.
          </p>
        </div>
        <div className="glass card">
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Tracking and privacy</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            A referral is remembered only in browsers that accepted analytics cookies, for {s.cookieDays} days. We count clicks without storing who clicked, and affiliates never see buyers&apos; names
            or details. See the <Link href="/legal/privacy">privacy policy</Link>.
          </p>
        </div>
      </section>

      <section className="sec">
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Affiliate terms</h2>
        <div className="glass card" style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {s.terms}
          <div className="tag">Version {s.termsVersion}. You accept the version shown when you join.</div>
        </div>
      </section>

      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>Questions</h2>
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
