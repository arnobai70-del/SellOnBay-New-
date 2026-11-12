import type { Metadata } from 'next';
import Link from 'next/link';
import { AffJoinForm, AffLinkGenerator, AffProfileForm, AffWithdrawForm } from '@/components/glass/AffiliateForms';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { joinFeeCents, KIND_LABEL, productEligible, STATUS_LABEL, STATUS_TONE } from '@/lib/affiliates/rules';
import { affSettings, dashboardOf } from '@/lib/affiliates/service';
import { publicWebsites, websitePath } from '@/lib/glass/catalog';
import { SITE_URL } from '@/lib/site';
import { requireViewer } from '@/lib/supabase/viewer';

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
  const viewer = await requireViewer({ path: '/dashboard/buyer/affiliate', roles: ['buyer', 'seller', 'admin'] });
  const s = await affSettings();
  const d = viewer ? await dashboardOf(viewer.id) : null;
  const now = Date.now();
  const sites = d ? (await publicWebsites()).filter((w) => productEligible(s, w.id)).map((w) => ({ key: w.id, name: w.name, path: websitePath(w.id) })) : [];
  return (
    <BuyerShell viewer={viewer} active="affiliate" file="buyer-websites" title="Affiliate" subtitle="Share SellOnBay websites and earn on verified sales.">
      {!d ? (
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>Join the affiliate program</h2>
          {!s.enabled ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                The affiliate program is not open yet.
              </p>
              <span className="status st-draft" style={{ alignSelf: 'flex-start' }}>
                Coming soon
              </span>
            </>
          ) : viewer ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                Use your SellOnBay account; no new account is needed. You can share links and earn straight away; {s.targetSales} verified sales within {s.qualificationDays} days make you a Verified
                Affiliate. <Link href="/affiliates">How it works</Link>.
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
            <p className="muted">The dashboard needs an account.</p>
          )}
        </section>
      ) : (
        <>
          {!s.enabled && <p className="sob-note">The affiliate program is paused: new referrals are not tracked right now. Everything you earned stays yours, and you can still withdraw.</p>}
          <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2>{d.affiliate.displayName || 'Your affiliate account'}</h2>
                <div className="tag">
                  Code {d.affiliate.code} · joined {day(d.affiliate.createdAt)} · terms {d.affiliate.termsVersion}
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
                  Qualification: {d.qualificationSales} of {s.targetSales} verified sales ·{' '}
                  {d.affiliate.qualificationEndsAt > now ? `${Math.ceil((d.affiliate.qualificationEndsAt - now) / 86_400_000)} days left` : 'window ended; we may extend it'}
                </div>
                <div className="bar" aria-label="Qualification progress">
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
            <h2 style={{ marginBottom: 8 }}>Your links</h2>
            {d.affiliate.status === 'suspended' || d.affiliate.status === 'rejected' ? (
              <p className="muted">Links are paused on this account.</p>
            ) : (
              <AffLinkGenerator code={d.affiliate.code} base={SITE_URL} sites={sites} />
            )}
          </section>

          <div className="grid2">
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>Withdraw</h2>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
                From {usd(s.minWithdrawalCents)}. An admin checks each request and pays it by hand to your payout method.
              </p>
              {d.affiliate.payoutMethod ? <AffWithdrawForm availableCents={d.availableCents} minCents={s.minWithdrawalCents} /> : <div className="tag">Add your payout method first.</div>}
            </section>
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>Profile and payout</h2>
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
              <h2>Commissions</h2>
            </div>
            <div className="tbl" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Sale</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.commissions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No commissions yet.
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
                          {c.status === 'pending' ? `Pending${c.approveAfter ? ` until ${day(c.approveAfter)}` : ''}` : c.status === 'approved' ? 'Approved' : 'Reversed (refund)'}
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
              <h2 style={{ marginBottom: 8 }}>Withdrawals</h2>
              {d.withdrawals.length === 0 && <p className="muted">None yet.</p>}
              {d.withdrawals.map((w) => (
                <div key={w.id} className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>
                    {day(w.createdAt)} · {usd(w.amountCents)} · {w.method} {w.detailsMasked}
                  </span>
                  <span className={`status ${w.status === 'paid' ? 'st-ok' : w.status === 'rejected' ? 'st-bad' : 'st-wait'}`}>
                    {w.status === 'paid'
                      ? `Paid${w.payoutReference ? ` · ${w.payoutReference}` : ''}`
                      : w.status === 'requested'
                        ? 'Waiting for review'
                        : w.status === 'approved'
                          ? 'Approved, not paid yet'
                          : 'Rejected'}
                  </span>
                </div>
              ))}
            </section>
            <section className="glass card">
              <h2 style={{ marginBottom: 8 }}>Recent activity</h2>
              {d.activity.length === 0 && <p className="muted">Nothing yet. Share a link to get started.</p>}
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
          <div className="tag">Buyers&apos; names and details are never shown. Earnings are not guaranteed; refunds reverse commissions.</div>
        </>
      )}
    </BuyerShell>
  );
}
