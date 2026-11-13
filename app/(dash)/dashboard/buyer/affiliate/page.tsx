import type { Metadata } from 'next';
import Link from 'next/link';
import { AffJoinForm, AffLinkGenerator, AffProfileForm, AffWithdrawForm } from '@/components/glass/AffiliateForms';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { joinFeeCents, KIND_LABEL, productEligible, STATUS_LABEL, STATUS_TONE } from '@/lib/affiliates/rules';
import { mayUseDemoAdmin } from '@/lib/admin/mode';
import { affSettings, dashboardOf, DEMO_AFFILIATE } from '@/lib/affiliates/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { publicWebsites, websitePath } from '@/lib/glass/catalog';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Affiliate', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : '–');

/*
 * The affiliate dashboard (owner, 2026-11-12): status and qualification countdown, links, clicks, leads, verified sales, pending and approved
 * commissions, balance, withdrawals, badges, leaderboard place and recent activity. Buyers' names and details are never shown. A buyer or
 * seller joins with the same account; the affiliate role keeps its own money and permissions.
 */
export default async function AffiliateDashboard() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/buyer/affiliate', roles: ['buyer', 'seller', 'admin'] });
  const s = await affSettings();
  // the demo build has no accounts: one demo affiliate stands in, only on a server marked as a demo (never in production)
  const userId = viewer?.id ?? (!supabaseConfigured && mayUseDemoAdmin(process.env) ? DEMO_AFFILIATE : null);
  const shellViewer = viewer ?? (userId ? { id: userId, name: 'Demo affiliate', role: 'buyer' } : null);
  const d = userId ? await dashboardOf(userId) : null;
  const now = Date.now();
  const sites = d ? (await publicWebsites()).filter((w) => productEligible(s, w.id)).map((w) => ({ key: w.id, name: w.name, path: websitePath(w.id) })) : [];
  return (
    <BuyerShell viewer={shellViewer} active="affiliate" file="buyer-websites" title={tx('Affiliate')} subtitle="Share SellOnBay websites and earn on verified sales.">
      {!d ? (
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>
            <T s={'Join the affiliate program'} />
          </h2>
          {!s.enabled ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                <T s={'The affiliate program is not open yet.'} />
              </p>
              <span className="status st-draft" style={{ alignSelf: 'flex-start' }}>
                <T s={'Coming soon'} />
              </span>
            </>
          ) : userId ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                <T
                  s={
                    'Use your SellOnBay account; no new account is needed. You can share links and earn straight away; {targetSales} verified sales within {qualificationDays} days make you a Verified Affiliate.'
                  }
                  v={{ targetSales: s.targetSales, qualificationDays: s.qualificationDays }}
                />{' '}
                <Link href="/affiliates">
                  <T s={'How it works'} />
                </Link>
                .
              </p>
              <AffJoinForm
                termsVersion={s.termsVersion}
                feeText={
                  joinFeeCents(s) === 0
                    ? `Free during the promotion (normally ${usd(s.feeCents)}). Nothing is ever charged automatically.`
                    : `Registration fee ${usd(joinFeeCents(s))}. Nothing is charged automatically.`
                }
              />
            </>
          ) : (
            <p className="muted">
              <T s={'The dashboard needs an account.'} />
            </p>
          )}
        </section>
      ) : (
        <>
          {!s.enabled && (
            <p className="sob-note">
              <T s={'The affiliate program is paused: new referrals are not tracked right now. Everything you earned stays yours, and you can still withdraw.'} />
            </p>
          )}
          <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2>{d.affiliate.displayName || tx('Your affiliate account')}</h2>
                <div className="tag">
                  <T s={'Code {code} · joined {v1} · terms {termsVersion}'} v={{ code: d.affiliate.code, v1: day(d.affiliate.createdAt), termsVersion: d.affiliate.termsVersion }} />
                </div>
              </div>
              <span className={`status ${STATUS_TONE[d.affiliate.status]}`} style={d.affiliate.status === 'qualified' ? { background: '#1A8F5C', color: '#fff' } : undefined}>
                {d.affiliate.status === 'qualified' ? '✓ ' : ''}
                {STATUS_LABEL[d.affiliate.status]}
              </span>
            </div>
            {d.affiliate.status === 'pending' && (
              <>
                <div className="tag" style={{ margin: 0 }}>
                  <T
                    s={'Qualification: {qualificationSales} of {targetSales} verified sales · {v2}'}
                    v={{
                      qualificationSales: d.qualificationSales,
                      targetSales: s.targetSales,
                      v2: d.affiliate.qualificationEndsAt > now ? `${Math.ceil((d.affiliate.qualificationEndsAt - now) / 86_400_000)} days left` : 'window ended; we may extend it',
                    }}
                  />
                </div>
                <div className="bar" aria-label={tx('Qualification progress')}>
                  <i style={{ width: `${Math.min(100, Math.round((d.qualificationSales / Math.max(1, s.targetSales)) * 100))}%` }} />
                </div>
              </>
            )}
            {d.badges.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.badges.map((b) => (
                  <span key={b.key} className="status" style={{ background: b.color, color: '#fff' }}>
                    {b.icon} {b.name}
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
            {[
              ['Clicks', String(d.clicks), 'on your links'],
              ['Leads', String(d.signups), 'accounts made'],
              ['Verified sales', String(d.verifiedSales), 'paid and past refunds'],
              ['Pending', usd(d.pendingCents), 'waiting for the refund period'],
              ['Available', usd(d.availableCents), d.openWithdrawalCents ? `${usd(d.openWithdrawalCents)} requested` : 'ready to withdraw'],
              ['Total earned', usd(d.totalEarnedCents), `${usd(d.paidCents)} paid out`],
              ['This month', d.rank ? `#${d.rank}` : '–', 'leaderboard place'],
            ].map(([l, v, sub]) => (
              <div key={l} className="glass kpi">
                <div className="l">{l}</div>
                <div className="v">{v}</div>
                <div className="s">{sub}</div>
              </div>
            ))}
          </div>

          <section className="glass card">
            <h2 style={{ marginBottom: 8 }}>
              <T s={'Your links'} />
            </h2>
            {d.affiliate.status === 'suspended' || d.affiliate.status === 'rejected' ? (
              <p className="muted">
                <T s={'Links are paused on this account.'} />
              </p>
            ) : (
              <AffLinkGenerator code={d.affiliate.code} base={SITE_URL} sites={sites} />
            )}
          </section>

          <div className="grid2">
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>
                <T s={'Withdraw'} />
              </h2>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
                <T s={'From {v0}. An admin checks each request and pays it by hand to your payout method.'} v={{ v0: usd(s.minWithdrawalCents) }} />
              </p>
              {d.affiliate.payoutMethod ? (
                <AffWithdrawForm availableCents={d.availableCents} minCents={s.minWithdrawalCents} />
              ) : (
                <div className="tag">
                  <T s={'Add your payout method first.'} />
                </div>
              )}
            </section>
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>
                <T s={'Profile and payout'} />
              </h2>
              <AffProfileForm
                displayName={d.affiliate.displayName}
                publicLeaderboard={d.affiliate.publicLeaderboard}
                payoutMethod={d.affiliate.payoutMethod}
                payoutMasked={d.affiliate.payoutDetails}
              />
            </section>
          </div>

          <section className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="row" style={{ padding: '14px 14px 4px' }}>
              <h2>
                <T s={'Commissions'} />
              </h2>
            </div>
            <div className="tbl" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Date'} />
                    </th>
                    <th>
                      <T s={'Sale'} />
                    </th>
                    <th>
                      <T s={'Amount'} />
                    </th>
                    <th>
                      <T s={'Status'} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.commissions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        <T s={'No commissions yet.'} />
                      </td>
                    </tr>
                  )}
                  {d.commissions.map((c) => (
                    <tr key={c.id}>
                      <td>{day(c.createdAt)}</td>
                      <td>
                        {KIND_LABEL[c.kind]} · {c.rateBps / 100}%
                      </td>
                      <td>{usd(c.amountCents)}</td>
                      <td>
                        <span className={`status ${c.status === 'approved' ? 'st-ok' : c.status === 'reversed' ? 'st-bad' : 'st-wait'}`}>
                          {c.status === 'pending' ? `Pending${c.approveAfter ? ` until ${day(c.approveAfter)}` : ''}` : c.status === 'approved' ? tx('Approved') : tx('Reversed (refund)')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid2">
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>
                <T s={'Withdrawals'} />
              </h2>
              {d.withdrawals.length === 0 && (
                <p className="muted">
                  <T s={'None yet.'} />
                </p>
              )}
              {d.withdrawals.map((w) => (
                <div key={w.id} className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>
                    {day(w.createdAt)} · {usd(w.amountCents)} · {w.method} {w.detailsMasked}
                  </span>
                  <span className={`status ${w.status === 'paid' ? 'st-ok' : w.status === 'rejected' ? 'st-bad' : 'st-wait'}`}>
                    {w.status === 'paid'
                      ? `Paid${w.payoutReference ? ` · ${w.payoutReference}` : ''}`
                      : w.status === 'requested'
                        ? tx('Waiting for review')
                        : w.status === 'approved'
                          ? tx('Approved, not paid yet')
                          : tx('Rejected')}
                  </span>
                </div>
              ))}
            </section>
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>
                <T s={'Recent activity'} />
              </h2>
              {d.activity.length === 0 && (
                <p className="muted">
                  <T s={'Nothing yet. Share a link to get started.'} />
                </p>
              )}
              {d.activity.map((x, i) => (
                <div key={i} className="li" style={{ fontSize: 14 }}>
                  <span className="tag" style={{ margin: 0, minWidth: 86 }}>
                    {day(x.at)}
                  </span>
                  <span>{x.text}</span>
                </div>
              ))}
            </section>
          </div>
          <div className="tag">
            <T s={"Buyers' names and details are never shown. Earnings are not guaranteed; refunds reverse commissions."} />
          </div>
        </>
      )}
    </BuyerShell>
  );
}
