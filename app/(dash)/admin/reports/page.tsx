import type { Metadata } from 'next';
import Link from 'next/link';
import { ReportsPanel } from '@/components/ReportsPanel';
import { AdminShell } from '@/components/glass/AdminShell';
import { getLiveDbProducts } from '@/lib/catalog';
import { DAY_MS, PLAN_FEE_TEXT, PLAN_KEEP_TEXT } from '@/lib/config';
import { openDisputes } from '@/lib/disputes';
import { profileNames } from '@/lib/glass/admin';
import { usd } from '@/lib/glass/orderStatus';
import { orderStore } from '@/lib/orders/store';
import { listPayouts } from '@/lib/payouts';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Reports', robots: { index: false } };
export const dynamic = 'force-dynamic';

const BETA = ['beta_requested', 'beta_approved', 'beta_declined'];
const DONE = ['accepted', 'payout_pending', 'paid_out', 'beta_approved'];
const KINDS = [
  ['sales', 'Sales', 'Orders, methods, totals'],
  ['earnings', 'Seller earnings', `${PLAN_KEEP_TEXT} share per seller`],
  ['domains', 'Domain sales', 'Orders with a domain'],
  ['refunds', 'Refunds & disputes', 'Reasons, outcomes'],
  ['payouts', 'Payouts', 'Paid, pending, failed'],
  ['income', 'Platform income', `${PLAN_FEE_TEXT} share + domains`],
] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/*
 * design-reference/admin-reports.html: pick a report and a date range. Figures come from the orders themselves (beta requests count at $0);
 * the sales PDF is the same export as before (/api/admin/reports/sales, Finance). Sales by category use the listing's category.
 */
export default async function AdminReports({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/reports', roles: ['admin'], scope: 'finance' });
  const sp = await searchParams;
  const kind = KINDS.find(([k]) => k === sp.r) ?? KINDS[0];
  const now = Date.now();
  const to = DAY.test(sp.to ?? '') ? sp.to! : iso(now);
  const from = DAY.test(sp.from ?? '') ? sp.from! : iso(now - 29 * DAY_MS);
  const fromMs = Date.parse(from + 'T00:00:00Z');
  const toMs = Date.parse(to + 'T00:00:00Z') + DAY_MS;
  const [changed, live, disputes, payouts] = await Promise.all([
    (async () => (await orderStore()).changedSince(Math.min(fromMs, now - 186 * DAY_MS)))(),
    getLiveDbProducts('web').catch(() => []),
    openDisputes().catch(() => []),
    listPayouts({}).catch(() => []),
  ]);
  const orders = changed.filter((o) => o.createdAt >= fromMs && o.createdAt < toMs);
  const paid = orders.filter((o) => o.fundedAt);
  const gross = paid.reduce((s, o) => s + o.priceCents - o.refundedCents, 0);
  const refundedN = orders.filter((o) => o.refundedCents > 0 || o.state === 'refunded').length;
  const catOf = new Map(live.map((p) => [p.id, p.cat]));
  const byCat = new Map<string, number>();
  for (const o of orders) {
    const c = catOf.get(o.productKey ?? '') ?? 'Other';
    byCat.set(c, (byCat.get(c) ?? 0) + (o.fundedAt ? o.priceCents - o.refundedCents : 0));
  }
  const counts = new Map<string, number>();
  for (const o of orders) {
    const c = catOf.get(o.productKey ?? '') ?? 'Other';
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const cats = [...counts.keys()]
    .map((c) => ({ c, sales: byCat.get(c) ?? 0, n: counts.get(c) ?? 0 }))
    .sort((a, b) => b.sales - a.sales || b.n - a.n)
    .slice(0, 6);
  const maxCat = Math.max(1, ...cats.map((c) => c.sales || c.n));
  const sellers = new Map<string, { n: number; gross: number; fee: number }>();
  for (const o of orders) {
    if (!o.sellerId) continue;
    const s = sellers.get(o.sellerId) ?? { n: 0, gross: 0, fee: 0 };
    s.n++;
    if (o.fundedAt) {
      s.gross += o.priceCents - o.refundedCents;
      s.fee += o.feeCents;
    }
    sellers.set(o.sellerId, s);
  }
  const names = await profileNames([...sellers.keys()]);
  const top = [...sellers.entries()].sort((a, b) => b[1].gross - a[1].gross || b[1].n - a[1].n).slice(0, 8);
  const months = new Map<string, { month: string; orders: number; beta: number; done: number; sales: number }>();
  for (const o of changed.filter((x) => x.createdAt >= now - 186 * DAY_MS)) {
    const month = new Date(o.createdAt).toISOString().slice(0, 7);
    const m = months.get(month) ?? { month, orders: 0, beta: 0, done: 0, sales: 0 };
    m.orders++;
    if (BETA.includes(o.state)) m.beta++;
    if (DONE.includes(o.state)) m.done++;
    if (o.fundedAt) m.sales += o.priceCents - o.refundedCents;
    months.set(month, m);
  }
  const summary: Record<(typeof KINDS)[number][0], string> = {
    sales: `${orders.length} orders · ${usd(gross)} paid`,
    earnings: `${sellers.size} sellers · ${usd(paid.reduce((s, o) => s + o.priceCents - o.refundedCents - o.feeCents, 0))} earned`,
    domains: `${orders.filter((o) => o.domain).length} orders with a domain`,
    refunds: `${refundedN} refunded · ${disputes.length} disputes open`,
    payouts: `${payouts.filter((p) => p.paidAt && p.paidAt >= fromMs && p.paidAt < toMs).length} paid · ${payouts.filter((p) => p.status === 'scheduled' || p.status === 'exported').length} waiting · ${payouts.filter((p) => p.status === 'failed').length} failed`,
    income: `${usd(paid.reduce((s, o) => s + o.feeCents, 0))} platform share`,
  };
  const href = (r: string) => `/admin/reports?${new URLSearchParams({ ...(r !== 'sales' ? { r } : {}), ...(sp.from ? { from } : {}), ...(sp.to ? { to } : {}) })}`;
  return (
    <AdminShell viewer={viewer} active="reports" file="admin-reports" title={tx('Reports')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Reports'} />
          </h1>
          <div className="tag">
            <T s={'Pick a report, a date range, then export. Beta requests are counted, at $0.'} />
          </div>
        </div>
        <form action="/admin/reports" method="get" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {kind[0] !== 'sales' && <input type="hidden" name="r" value={kind[0]} />}
          <label htmlFor="rf" className="hidden-label">
            <T s={'From'} />
          </label>
          <input id="rf" name="from" className="input" type="date" defaultValue={from} style={{ width: 'auto' }} />{' '}
          <label htmlFor="rto" className="hidden-label">
            <T s={'To'} />
          </label>
          <input id="rto" name="to" className="input" type="date" defaultValue={to} style={{ width: 'auto' }} />{' '}
          <button className="btn ghost" type="submit">
            <T s={'Refresh'} />
          </button>
        </form>
      </div>
      <section className="glass card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(170px, 100%),1fr))', gap: 12 }}>
          {KINDS.map(([k, label, text]) => (
            <Link key={k} className={k === kind[0] ? 'rt on' : 'rt'} href={href(k)} prefetch={false} aria-current={k === kind[0] ? 'true' : undefined}>
              <b style={{ fontWeight: 500 }}>{label}</b>
              <span className="tag" style={{ margin: 0 }}>
                {text}
              </span>
            </Link>
          ))}
        </div>
        <div className="row" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #DEE8ED' }}>
          <div>
            <b style={{ fontWeight: 500 }}>
              <T s={'{v0} report'} v={{ v0: kind[1] }} />
            </b>
            <div className="tag">
              {nice(from)} – {nice(to)} · {summary[kind[0]]}
            </div>
          </div>
        </div>
        <ReportsPanel me={viewer?.id ?? 'demo-admin'} scope="admin" bare />
      </section>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">
            <T s={'Orders'} />
          </div>
          <div className="v">{orders.length}</div>
          <div className="s">
            {orders.filter((o) => !o.domain).length} <T s={'websites ·'} /> {orders.filter((o) => o.domain).length} <T s={'with a domain'} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Gross sales'} />
          </div>
          <div className="v">{usd(gross)}</div>
          <div className="s">
            <T s={'{length} paid orders'} v={{ length: paid.length }} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Refund rate'} />
          </div>
          <div className="v">{orders.length ? `${((refundedN / orders.length) * 100).toFixed(1)}%` : '0%'}</div>
          <div className="s">
            <T s={'{refundedN} of {length}'} v={{ refundedN, length: orders.length }} />
          </div>
        </div>
        <div className="glass kpi">
          <div className="l">
            <T s={'Avg. order'} />
          </div>
          <div className="v">{paid.length ? usd(Math.round(gross / paid.length)) : '$0.00'}</div>
          <div className="s">
            <T s={'Paid orders only'} />
          </div>
        </div>
      </div>
      <div className="grid2">
        <section className="glass card">
          <div className="row">
            <h2>
              <T s={'Sales by category'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              {cats.some((c) => c.sales) ? tx('Paid sales') : tx('Orders (no paid sales yet)')}
            </span>
          </div>
          {cats.length ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', height: 200, marginTop: 18 }} role="img" aria-label={cats.map((c) => `${c.c} ${c.sales ? usd(c.sales) : c.n}`).join(', ')}>
              {cats.map((c) => (
                <div key={c.c} className="colb" style={{ height: '100%' }}>
                  <span className="tag" style={{ margin: 0 }}>
                    {c.sales ? usd(c.sales) : c.n}
                  </span>
                  <span className="b" style={{ height: `${Math.max(4, Math.round(((c.sales || c.n) / maxCat) * 90))}%` }} />
                  <span className="tag" style={{ margin: 0 }}>
                    {c.c}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 14 }}>
              <T s={'No orders in these dates.'} />
            </p>
          )}
        </section>
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>
              <T s={'Top sellers'} />
            </h2>
            <span className="tag" style={{ margin: 0 }}>
              <T s={'By paid sales'} />
            </span>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>
                    <T s={'Seller'} />
                  </th>
                  <th>
                    <T s={'Sales'} />
                  </th>
                  <th>
                    <T s={'Gross'} />
                  </th>
                  <th>
                    <T s={'Earned'} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {top.length ? (
                  top.map(([id, s]) => (
                    <tr key={id}>
                      <td style={{ fontWeight: 500 }}>{names.get(id) ?? tx('Seller')}</td>
                      <td>{s.n}</td>
                      <td>{usd(s.gross)}</td>
                      <td>{usd(s.gross - s.fee)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted">
                      <T s={'No seller orders in these dates.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="glass" style={{ padding: '8px 8px 4px' }}>
        <div className="row" style={{ padding: '14px 14px 4px' }}>
          <h2>
            <T s={'Orders by month'} />
          </h2>
          <Link className="tag" style={{ margin: 0 }} href="/admin/reports/sales" prefetch={false}>
            <T s={'Every sales export'} />
          </Link>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>
                  <T s={'Month'} />
                </th>
                <th>
                  <T s={'Orders'} />
                </th>
                <th>
                  <T s={'Beta requests'} />
                </th>
                <th>
                  <T s={'Completed'} />
                </th>
                <th>
                  <T s={'Paid sales'} />
                </th>
              </tr>
            </thead>
            <tbody>
              {[...months.values()]
                .sort((a, b) => b.month.localeCompare(a.month))
                .map((m) => (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 500 }}>{m.month}</td>
                    <td>{m.orders}</td>
                    <td>{m.beta}</td>
                    <td>{m.done}</td>
                    <td>{usd(m.sales)}</td>
                  </tr>
                ))}
              {!months.size && (
                <tr>
                  <td colSpan={5} className="muted">
                    <T s={'No orders in the last six months.'} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
