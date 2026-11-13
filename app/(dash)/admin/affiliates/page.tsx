import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { AdminShell } from '@/components/glass/AdminShell';
import { AffSettingsForm, type Section } from '@/components/glass/AffSettingsForm';
import { hasScope } from '@/lib/admin/scopes';
import { ADMIN_MOVES, KIND_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/affiliates/rules';
import { affSettings, allAffiliates, allAttributions, allCommissions, allWithdrawals, clicksOf, fraudSignals, leaderboard, overview } from '@/lib/affiliates/service';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Affiliate Management', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : '–');
const API = '/api/admin/affiliates';
const TABS = [
  ['overview', 'Overview'],
  ['accounts', 'Accounts'],
  ['registration', 'Registration & qualification'],
  ['commission', 'Commission'],
  ['tracking', 'Referral tracking'],
  ['reports', 'Reports'],
  ['badges', 'Badges'],
  ['leaderboard', 'Leaderboard'],
  ['withdrawals', 'Withdrawals'],
  ['fraud', 'Fraud'],
  ['notifications', 'Notifications'],
  ['settings', 'Program settings'],
] as const;
type Tab = (typeof TABS)[number][0];

/*
 * Admin › Affiliate Management (owner, 2026-11-12): twelve sections on one page, chosen by ?tab=. Settings need a Super Admin (the API checks
 * on every save); affiliates, commissions and withdrawals need Finance or Super. Nothing here pays anyone: payouts are made by hand, then
 * marked paid with their reference, once.
 */
export default async function AdminAffiliates({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/affiliates', roles: ['admin'], scope: ['finance', 'super'] });
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? 'overview') as Tab;
  const superAdmin = !viewer || hasScope(viewer.scopes ?? [], 'super');
  const [s, affs, comms, wds, ov] = await Promise.all([affSettings(), allAffiliates(), allCommissions(), allWithdrawals(), overview()]);
  const byId = new Map(affs.map((a) => [a.id, a]));
  const who = (id: string) => {
    const a = byId.get(id);
    return a ? `${a.displayName || 'Unnamed'} · ${a.code}` : id.slice(0, 8);
  };
  const settingsForm = (section: Section) =>
    superAdmin ? (
      <AffSettingsForm initial={s} section={section} />
    ) : (
      <p className="muted">
        <T s={'Only a Super Admin can change these settings.'} />
      </p>
    );
  const now = Date.now();
  return (
    <AdminShell viewer={viewer} active="affiliates" file="admin-finance" title={tx('Affiliate Management')} subtitle="The affiliate program: accounts, commissions, tracking, payouts and settings.">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className={`status ${s.enabled ? 'st-ok' : 'st-draft'}`}>{s.enabled ? tx('Program on') : tx('Program off')}</span>
        <Link className="btn sm ghost" href="/affiliates" prefetch={false}>
          <T s={'Public page'} />
        </Link>
      </div>
      <nav className="seg" aria-label={tx('Affiliate Management')} style={{ flexWrap: 'wrap', alignSelf: 'flex-start' }}>
        {TABS.map(([k, label]) => (
          <Link key={k} aria-current={tab === k ? 'page' : undefined} className={tab === k ? 'on' : ''} href={`/admin/affiliates?tab=${k}`} prefetch={false}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
          {[
            ['Affiliates', String(ov.affiliates), `${ov.pending} pending · ${ov.qualified} verified`],
            ['Clicks', String(ov.clicks), `${ov.conversion}% became a purchase`],
            ['Leads', String(ov.signups), 'accounts made'],
            ['Sales this month', String(ov.monthSales), 'not reversed'],
            ['Pending commission', usd(ov.commissionsPendingCents), 'in the refund period'],
            ['Approved commission', usd(ov.commissionsApprovedCents), `${ov.reversed} reversed`],
            ['Withdrawals waiting', String(ov.withdrawalsWaiting), 'requested or approved'],
          ].map(([l, v, sub]) => (
            <div key={l} className="glass kpi">
              <div className="l">{l}</div>
              <div className="v">{v}</div>
              <div className="s">{sub}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'accounts' && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="tbl" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Affiliate'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                  <th>
                    <T s={'Qualification'} />
                  </th>
                  <th>
                    <T s={'Fee'} />
                  </th>
                  <th>
                    <T s={'Actions'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {affs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      <T s={'No affiliates yet.'} />
                    </td>
                  </tr>
                )}
                {(sp.status ? affs.filter((a) => a.status === sp.status) : affs).map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.displayName || tx('Unnamed')}
                      <div className="tag">
                        <T s={'{code} · joined {v1} · terms {termsVersion}'} v={{ code: a.code, v1: day(a.createdAt), termsVersion: a.termsVersion }} />
                      </div>
                    </td>
                    <td>
                      <span className={`status ${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    </td>
                    <td>{a.status === 'qualified' ? `Verified ${day(a.verifiedAt)}` : `Ends ${day(a.qualificationEndsAt)}${a.qualificationEndsAt < now ? ' (ended)' : ''}`}</td>
                    <td>{a.feeWaived ? tx('Waived') : usd(a.feeCents)}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {ADMIN_MOVES[a.status].map((to) => (
                        <ActionButton
                          key={to}
                          endpoint={API}
                          body={{ action: 'move', id: a.id, to }}
                          label={STATUS_LABEL[to]}
                          tone="line"
                          note={to === 'suspended' || to === 'rejected' ? { label: 'Reason (kept in the audit log)', required: true } : undefined}
                        />
                      ))}
                      {a.status === 'pending' && (
                        <>
                          <ActionButton
                            endpoint={API}
                            body={{ action: 'qualification', id: a.id, mode: 'extend' }}
                            label="Extend"
                            tone="line"
                            note={{ label: 'Days to add (1 to 365)', required: true }}
                          />
                          <ActionButton
                            endpoint={API}
                            body={{ action: 'qualification', id: a.id, mode: 'restart', days: s.qualificationDays }}
                            label="Restart"
                            tone="line"
                            confirm={`Restart this affiliate's ${s.qualificationDays}-day qualification window from today?`}
                          />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'registration' && (
        <section className="glass card">
          <h2 style={{ marginBottom: 8 }}>
            <T s={'Registration fee and qualification'} />
          </h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
            <T s={'Nothing is ever charged automatically. An affiliate who reaches the target in time becomes a Verified Affiliate.'} />
          </p>
          {settingsForm('registration')}
        </section>
      )}

      {tab === 'commission' && (
        <>
          <section className="glass card">
            <h2 style={{ marginBottom: 8 }}>
              <T s={'Rates and approval'} />
            </h2>
            {settingsForm('commission')}
          </section>
          <section className="glass card">
            <h2 style={{ marginBottom: 8 }}>
              <T s={'Eligible websites'} />
            </h2>
            {settingsForm('products')}
          </section>
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
                      <T s={'Affiliate'} />
                    </th>
                    <th>
                      <T s={'Sale'} />
                    </th>
                    <th>
                      <T s={'Basis'} />
                    </th>
                    <th>
                      <T s={'Amount'} />
                    </th>
                    <th>
                      <T s={'Status'} />
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {comms.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">
                        <T s={'No commissions yet.'} />
                      </td>
                    </tr>
                  )}
                  {comms.slice(0, 200).map((c) => (
                    <tr key={c.id}>
                      <td>{day(c.createdAt)}</td>
                      <td>{who(c.affiliateId)}</td>
                      <td>
                        {KIND_LABEL[c.kind]} · {c.rateBps / 100}%
                      </td>
                      <td>{usd(c.basisCents)}</td>
                      <td>{usd(c.amountCents)}</td>
                      <td>
                        <span className={`status ${c.status === 'approved' ? 'st-ok' : c.status === 'reversed' ? 'st-bad' : 'st-wait'}`}>{c.status}</span>
                      </td>
                      <td>
                        {c.status !== 'reversed' && (
                          <ActionButton endpoint={API} body={{ action: 'reverse', id: c.id }} label="Reverse" tone="line" note={{ label: 'Why (kept in the audit log)', required: true }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'tracking' && <Tracking settingsForm={settingsForm('tracking')} who={who} />}

      {tab === 'reports' && (
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>
            <T s={'Reports'} />
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            <T s={'One row per affiliate: clicks, referrals, verified sales, pending and approved commission. No customer data is included.'} />
          </p>
          <a className="btn sm" style={{ alignSelf: 'flex-start' }} href="/api/admin/affiliates/export">
            <T s={'Download CSV'} />
          </a>
        </section>
      )}

      {tab === 'badges' && (
        <section className="glass card">
          <h2 style={{ marginBottom: 8 }}>
            <T s={'Badges'} />
          </h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
            <T s={'Badges follow verified, non-refunded sales, so a reversed sale can take one away.'} />
          </p>
          {settingsForm('badges')}
        </section>
      )}

      {tab === 'leaderboard' && <Leaders publicOn={s.leaderboardPublic} />}

      {tab === 'withdrawals' && (
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>
              <T s={'Withdrawals'} />
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
                    <T s={'Affiliate'} />
                  </th>
                  <th>
                    <T s={'Amount'} />
                  </th>
                  <th>
                    <T s={'Method'} />
                  </th>
                  <th>
                    <T s={'Status'} />
                  </th>
                  <th>
                    <T s={'Actions'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {wds.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      <T s={'No withdrawals yet.'} />
                    </td>
                  </tr>
                )}
                {wds.map((w) => (
                  <tr key={w.id}>
                    <td>{day(w.createdAt)}</td>
                    <td>{who(w.affiliateId)}</td>
                    <td>{usd(w.amountCents)}</td>
                    <td>
                      {w.method} {w.detailsMasked}
                    </td>
                    <td>
                      <span className={`status ${w.status === 'paid' ? 'st-ok' : w.status === 'rejected' ? 'st-bad' : 'st-wait'}`}>
                        {w.status}
                        {w.payoutReference ? ` · ${w.payoutReference}` : ''}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {w.status === 'requested' && <ActionButton endpoint={API} body={{ action: 'withdrawal', id: w.id, decision: 'approve' }} label="Approve" />}
                      {(w.status === 'requested' || w.status === 'approved') && (
                        <>
                          <ActionButton
                            endpoint={API}
                            body={{ action: 'withdrawal', id: w.id, decision: 'paid' }}
                            label="Mark paid"
                            tone="line"
                            note={{ label: 'Payout reference (after you have paid by hand)', required: true }}
                          />
                          <ActionButton
                            endpoint={API}
                            body={{ action: 'withdrawal', id: w.id, decision: 'reject' }}
                            label="Reject"
                            tone="line"
                            confirm="Reject this withdrawal? The amount goes back to the affiliate's available balance."
                          />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'fraud' && (
        <>
          <section className="glass card">
            <h2 style={{ marginBottom: 8 }}>
              <T s={'Fraud rules'} />
            </h2>
            {settingsForm('fraud')}
          </section>
          <Fraud />
        </>
      )}

      {tab === 'notifications' && (
        <section className="glass card">
          <h2 style={{ marginBottom: 8 }}>
            <T s={'Notifications'} />
          </h2>
          {settingsForm('notifications')}
        </section>
      )}

      {tab === 'settings' && (
        <section className="glass card">
          <h2 style={{ marginBottom: 8 }}>
            <T s={'Program settings'} />
          </h2>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
            <T s={'While the program is off, the public page is hidden and new registrations and referral tracking stop. Earned commissions and withdrawals keep working.'} />
          </p>
          {settingsForm('program')}
        </section>
      )}
    </AdminShell>
  );
}

async function Tracking({ settingsForm, who }: { settingsForm: React.ReactNode; who: (id: string) => string }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [clicks, attrs] = await Promise.all([clicksOf(), allAttributions()]);
  const byProduct = new Map<string, number>();
  for (const c of clicks) byProduct.set(c.productKey || '(general link)', (byProduct.get(c.productKey || '(general link)') ?? 0) + 1);
  return (
    <>
      <section className="glass card">
        <h2 style={{ marginBottom: 8 }}>
          <T s={'Referral cookie'} />
        </h2>
        {settingsForm}
        <div className="tag">
          <T s={'The cookie is set only in browsers that accepted analytics cookies. The first affiliate wins; self-referrals never count.'} />
        </div>
      </section>
      <div className="grid2">
        <section className="glass card">
          <h2 style={{ marginBottom: 8 }}>
            <T s={'Clicks by website'} />
          </h2>
          {byProduct.size === 0 && (
            <p className="muted">
              <T s={'No clicks yet.'} />
            </p>
          )}
          {[...byProduct.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([k, n]) => (
              <div key={k} className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>{k}</span>
                <b>{n}</b>
              </div>
            ))}
        </section>
        <section className="glass card">
          <h2 style={{ marginBottom: 8 }}>
            <T s={'Recent referrals'} />
          </h2>
          {attrs.length === 0 && (
            <p className="muted">
              <T s={'No referrals yet.'} />
            </p>
          )}
          {[...attrs]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 30)
            .map((x) => (
              <div key={x.id} className="li" style={{ fontSize: 14 }}>
                <span className="tag" style={{ margin: 0, minWidth: 86 }}>
                  {day(x.createdAt)}
                </span>
                <span style={{ flex: 1 }}>
                  {x.kind === 'signup' ? tx('Sign-up') : x.kind === 'order' ? tx('Website order') : x.kind === 'buyer_sub' ? tx('Buyer subscription') : tx('Seller subscription')}
                </span>
                <span className="tag" style={{ margin: 0 }}>
                  {who(x.affiliateId)}
                </span>
              </div>
            ))}
        </section>
      </div>
    </>
  );
}

async function Leaders({ publicOn }: { publicOn: boolean }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const rows = await leaderboard();
  return (
    <section className="glass" style={{ padding: '8px 8px 4px' }}>
      <div className="row" style={{ padding: '14px 14px 4px' }}>
        <h2>
          <T s={'This month'} />
        </h2>
        <span className={`status ${publicOn ? 'st-ok' : 'st-draft'}`}>{publicOn ? tx('Public top 5 shown') : tx('Public board hidden')}</span>
      </div>
      <div className="tbl" style={{ overflowX: 'auto' }}>
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
              <th>
                <T s={'Net revenue'} />
              </th>
              <th>
                <T s={'Public'} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  <T s={'No affiliates yet.'} />
                </td>
              </tr>
            )}
            {rows.slice(0, 50).map((r) => (
              <tr key={r.affiliateId}>
                <td>{r.rank}</td>
                <td>{r.name}</td>
                <td>{r.sales}</td>
                <td>{usd(r.netCents)}</td>
                <td>{r.public ? tx('Yes') : tx('Hidden by affiliate')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Fraud() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const rows = await fraudSignals();
  return (
    <section className="glass card">
      <h2 style={{ marginBottom: 8 }}>
        <T s={'Signals to check'} />
      </h2>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: 14 }}>
        <T s={'Nothing is done automatically. Suspend an affiliate from Accounts, or reverse a commission from Commission.'} />
      </p>
      {rows.length === 0 && (
        <p className="muted">
          <T s={'Nothing unusual.'} />
        </p>
      )}
      {rows.map((r) => (
        <div key={r.affiliate.id} className="li" style={{ fontSize: 14 }}>
          <span style={{ flex: 1 }}>
            {r.affiliate.displayName || tx('Unnamed')} · {r.affiliate.code}
          </span>
          <span className="tag" style={{ margin: 0 }}>
            <T s={'{clicks} clicks · {sales} sales · {reversed} reversed · {signups} sign-ups'} v={{ clicks: r.clicks, sales: r.sales, reversed: r.reversed, signups: r.signups }} />
          </span>
          <span className="status st-bad">{r.flags.join(', ')}</span>
        </div>
      ))}
    </section>
  );
}
