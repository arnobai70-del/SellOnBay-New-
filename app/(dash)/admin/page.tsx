import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { LineChart, Ring } from '@/components/glass/Charts';
import { ageText } from '@/lib/admin/opsQueues';
import { hasScope } from '@/lib/admin/scopes';
import { actionText, adminOverview, isPeriod, PERIODS, type Period } from '@/lib/glass/adminOverview';
import { PLAN_FEE_TEXT } from '@/lib/config';
import { getSettings } from '@/lib/settings';
import { requireViewer } from '@/lib/supabase/viewer';
import { TargetForm } from '@/components/glass/TargetForm';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Admin overview'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Money as the design writes it: $4,820 (cents only when there are some). */
const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const DOT = { ok: '#3F8F77', warn: '#C9962E', bad: '#C2553F', off: '#A9B8C0' } as const;
const AV = ['#DDEAF6', '#DCF0E7', '#E6E2F4', '#F1E8DD'];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'SA';
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const left = (t: number, now: number) => `${Math.max(0, Math.round((t - now) / 3_600_000))}h left`;
const greeting = (now: number) => {
  const h = new Date(now).getUTCHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/* design-reference/admin.html, wired to the real stores (lib/glass/adminOverview.ts). */
export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ denied?: string; period?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin', roles: ['admin'] });
  const { denied, period: p } = await searchParams;
  const period: Period = isPeriod(p) ? p : '30d';
  const now = Date.now();
  const [o, settings] = await Promise.all([adminOverview(period, now), getSettings()]);
  const target = settings.monthlyTargetCents;
  const share = target > 0 ? o.monthSales / target : 0;
  const first = (viewer?.name ?? 'Admin').split(/\s+/)[0];
  const attention = [
    {
      tone: 'st-wait',
      label: tx('Payments'),
      text: o.paymentsMode === 'beta_free' ? `${o.beta} free beta requests waiting for a decision` : `${o.toVerify} payments waiting for verification`,
      href: '/admin/orders',
      act: 'Verify',
      n: o.paymentsMode === 'beta_free' ? o.beta : o.toVerify,
    },
    { tone: 'st-info', label: tx('Listings'), text: `${o.counts.listings} new websites waiting for review`, href: '/admin/listings', act: 'Review', n: o.counts.listings },
    {
      tone: 'st-bad',
      label: tx('Dispute'),
      text: o.disputes ? `${o.disputes} open · oldest ${ageText(o.oldestDispute, now)}` : 'No open disputes',
      href: '/admin/support',
      act: 'Open',
      n: o.disputes,
    },
    { tone: 'st-ok', label: tx('Payouts'), text: `${o.payoutSellers} sellers ready for Thursday payout`, href: '/admin/finance', act: 'Pay', n: o.payoutSellers },
    { tone: 'st-draft', label: tx('Domains'), text: `${o.domainsSoon} domains expire in the next 7 days`, href: '/admin/domains', act: 'Remind', n: o.domainsSoon },
  ];
  // The work queues of the permissions this admin has (purchase requests, releases, revisions, files, tickets, renewals).
  const scopes = viewer?.scopes ?? ['super'];
  const queues = o.ops.filter((q) => q.key !== 'payments' && hasScope(scopes, q.scope) && q.n > 0);
  const waiting = queues.reduce((s, q) => s + q.n, 0) + attention.reduce((s, a) => s + a.n, 0);
  return (
    <AdminShell viewer={viewer} active="overview" file="admin" title={tx('Admin overview')} head={false}>
      <div className="row">
        <div>
          <h1>
            {greeting(now)}, {first}
          </h1>
          <div className="tag">
            <T s={'Here is what needs you today · {v0}'} v={{ v0: PERIODS[period].toLowerCase() }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="seg" role="tablist" aria-label={tx('Period')}>
            {(Object.keys(PERIODS) as Period[]).map((k) => (
              <Link key={k} className={k === period ? 'on' : ''} href={k === '30d' ? '/admin' : `/admin?period=${k}`} prefetch={false} role="tab" aria-selected={k === period}>
                {PERIODS[k]}
              </Link>
            ))}
          </div>
          <Link className="btn ghost" href="/admin/settings#dashboard" prefetch={false}>
            <T s={'Customize'} />
          </Link>
        </div>
      </div>
      {denied && (
        <section className="glass card widget" role="alert">
          <T s={'Your admin account does not have permission for that page.'} />
        </section>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="kpis">
          <div className="glass kpi widget">
            <div className="l">
              <T s={'Gross sales'} />
            </div>
            <div className="v">{money(o.gross)}</div>
            <div className="s">{o.paymentsMode === 'beta_free' ? tx('Free beta: nothing is charged') : PERIODS[period]}</div>
          </div>
          <div className="glass kpi widget">
            <div className="l">
              <T s={'Platform income ({PLAN_FEE_TEXT})'} v={{ PLAN_FEE_TEXT }} />
            </div>
            <div className="v">{money(o.fees)}</div>
            <div className="s">
              <T s={'{v0} earned in all'} v={{ v0: money(o.revenue) }} />
            </div>
          </div>
          <div className="glass kpi widget">
            <div className="l">
              <T s={'Held in escrow'} />
            </div>
            <div className="v">{money(o.escrow)}</div>
            <div className="s">
              <T s={'{inReview} orders in review'} v={{ inReview: o.inReview }} />
            </div>
          </div>
          <div className="glass kpi widget">
            <div className="l">{o.paymentsMode === 'beta_free' ? tx('Requests to decide') : tx('Payments to verify')}</div>
            <div className="v">{o.paymentsMode === 'beta_free' ? o.beta : o.toVerify}</div>
            <div className="s">{o.paymentsMode === 'beta_free' ? tx('Free beta requests') : tx('Bank and wallet transfers')}</div>
          </div>
          <div className="glass kpi widget">
            <div className="l">
              <T s={'Open disputes'} />
            </div>
            <div className="v">{o.disputes}</div>
            <div className="s">{o.oldestDispute ? `Oldest ${ageText(o.oldestDispute, now)}` : tx('None open')}</div>
          </div>
          <div className="glass kpi widget">
            <div className="l">
              <T s={'Payouts due'} />
            </div>
            <div className="v">{money(o.payoutsDue)}</div>
            <div className="s">
              <T s={'Thursday'} />
            </div>
          </div>
        </div>

        <section className="glass card widget">
          <div className="row" style={{ marginBottom: 14 }}>
            <h2>
              <T s={'Quick access'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'Most used actions'} />
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px, 100%),1fr))', gap: 12 }}>
            {(
              [
                ['/admin/orders#pos', '#DCF0E7', 'M12 5v14M5 12h14', 'Manual order'],
                ['/admin/orders', '#FBEFD9', 'M5 12l5 5L20 7', o.paymentsMode === 'beta_free' ? 'Decide requests' : 'Verify payments'],
                ['/admin/listings', '#DDEAF6', 'M4 6h16M4 12h16M4 18h10', 'Review listings'],
                ['/admin/finance', '#E6E2F4', 'M3 7h18v10H3zM7 12h.01M17 12h.01', 'Process payouts'],
                ['/admin/marketing', '#F1E8DD', 'M20 12l-8 8-8-8 8-8zM12 9v.01', 'Create coupon'],
                ['/admin/reports', '#E8EEF2', 'M12 4v12M7 11l5 5 5-5M5 20h14', 'Export report'],
              ] as const
            ).map(([href, bg, d, label]) => (
              <Link key={label} className="qa" href={href} prefetch={false}>
                <span style={{ background: bg }} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B4250" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={d} />
                  </svg>
                </span>
                {label}
              </Link>
            ))}
          </div>
        </section>

        <div className="grid2">
          <section className="glass card widget">
            <div className="row">
              <h2>
                <T s={'Sales trend'} />
              </h2>
              <span className="tag" style={{ margin: 0 }}>
                {PERIODS[period]}
              </span>
            </div>
            <LineChart values={o.trend} label={`Paid sales per day, ${PERIODS[period].toLowerCase()}: ${money(o.gross)} in all`} />
            {o.gross === 0 && (
              <div className="tag" style={{ marginTop: 6 }}>
                <T s={'No paid sales in this period yet.'} />
              </div>
            )}
          </section>
          <section className="glass card widget" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Ring share={share} text={target > 0 ? `${Math.round(share * 100)}%` : '–'} label={target > 0 ? `${Math.round(share * 100)}% of the monthly target` : tx('No monthly target set')} />
            <div style={{ flex: '1 1 180px' }}>
              <h2>
                <T s={'Monthly target'} />
              </h2>
              <div className="muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
                <T s={'{v0} this month · {dayOfMonth} days in'} v={{ v0: money(o.monthSales), dayOfMonth: o.dayOfMonth }} />
              </div>
              <div className="tag">{target > 0 ? `Target ${money(target)} this month` : tx('No monthly target is set yet.')}</div>
              {viewer && hasScope(viewer.scopes ?? [], 'super') && <TargetForm dollars={target / 100} />}
            </div>
          </section>
        </div>

        <div className="grid2">
          <section className="glass card widget">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2>
                <T s={'Needs your attention'} />
              </h2>
              <span className={waiting ? 'status st-wait' : 'status st-ok'}>
                <T s={'{waiting} items'} v={{ waiting }} />
              </span>
            </div>
            {attention.map((a) => (
              <div key={a.label} className="li">
                <span className={`status ${a.tone}`}>{a.label}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{a.text}</div>
                <Link className="btn sm ghost" href={a.href} prefetch={false}>
                  {a.act}
                </Link>
              </div>
            ))}
            {queues.map((q) => (
              <div key={q.key} className="li">
                <span className="status st-info">{q.n}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  {q.label}
                  {q.oldestAt ? ` · oldest ${ageText(q.oldestAt, now)}` : ''}
                  {q.overdue ? ` · ${q.overdue} past 12 hours` : ''}
                </div>
                <Link className="btn sm ghost" href={q.href} prefetch={false}>
                  <T s={'Open'} />
                </Link>
              </div>
            ))}
          </section>
          <section className="glass card widget">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2>
                <T s={'Escrow review timers'} />
              </h2>
              <Link className="tag" style={{ margin: 0 }} href="/admin/orders" prefetch={false}>
                <T s={'All orders'} />
              </Link>
            </div>
            {o.timers.length ? (
              o.timers.map((t) => {
                const h = (t.endsAt - now) / 3_600_000;
                return (
                  <div key={t.id} className="li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                    <div className="row" style={{ fontSize: 14 }}>
                      <span>
                        <b style={{ fontWeight: 500 }}>#{t.id.slice(0, 8)}</b> <span className="muted">· {t.title}</span>
                      </span>
                      <span className={`status ${h < 12 ? 'st-bad' : h < 24 ? 'st-wait' : 'st-ok'}`}>{left(t.endsAt, now)}</span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${Math.round(t.share * 100)}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="li" style={{ fontSize: 14 }}>
                <span className="muted">
                  <T s={'No order is in its buyer review right now.'} />
                </span>
              </div>
            )}
          </section>
        </div>

        <div className="grid2">
          <section className="glass card widget">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2>
                <T s={'Recent activity'} />
              </h2>
              <Link className="tag" style={{ margin: 0 }} href="/admin/security" prefetch={false}>
                <T s={'Activity log'} />
              </Link>
            </div>
            {o.activity.length ? (
              o.activity.map((a, i) => (
                <div key={a.id} className="li">
                  <span className="av" style={{ width: 32, height: 32, fontSize: 11, background: AV[i % AV.length] }} aria-hidden="true">
                    {initials(a.who)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    {a.who}: {actionText(a.action)}
                    {a.target ? ` · ${a.target.slice(0, 24)}` : ''}
                  </div>
                  <span className="tag" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                    {ago(a.at, now)}
                  </span>
                </div>
              ))
            ) : (
              <div className="li" style={{ fontSize: 14 }}>
                <span className="muted">
                  <T s={'Nothing has been done yet.'} />
                </span>
              </div>
            )}
          </section>
          <section className="glass card widget">
            <div className="row" style={{ marginBottom: 6 }}>
              <h2>
                <T s={'System health'} />
              </h2>
              <Link className="tag" style={{ margin: 0 }} href="/admin/system" prefetch={false}>
                <T s={'Details'} />
              </Link>
            </div>
            {o.health.length ? (
              o.health.map((h) => (
                <div key={h.label} className="li" style={{ fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[h.tone], flex: 'none' }} />
                  <span style={{ flex: 1 }}>{h.label}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {h.text}
                  </span>
                </div>
              ))
            ) : (
              <div className="li" style={{ fontSize: 14 }}>
                <span className="muted">
                  <T s={'The checks did not answer in time.'} />
                </span>
              </div>
            )}
          </section>
        </div>
        <section className="glass card widget">
          <div className="row">
            <div>
              <h2>
                <T s={'Seller bulletin'} />
              </h2>
              <div className="tag">
                <T s={'Last notice sent to all sellers'} />
              </div>
            </div>
            <Link className="btn sm ghost" href="/admin/marketing#bulletin" prefetch={false}>
              <T s={'New bulletin'} />
            </Link>
          </div>
          <p className="muted" style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6 }}>
            <T s={'No bulletin has been sent yet.'} />
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
