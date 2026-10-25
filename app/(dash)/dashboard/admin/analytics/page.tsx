import type { Metadata } from 'next';
import Link from 'next/link';
import { AttractionTable, DaysTable, TopTable } from '@/components/AnalyticsTables';
import { DashShell } from '@/components/DashShell';
import { days, overview, reportDays } from '@/lib/analytics';
import { dayOf } from '@/lib/analyticsCore';
import { CONFIG, DAY_MS } from '@/lib/config';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Visitors', robots: { index: false } };
export const dynamic = 'force-dynamic';

const RANGES = [
  [1, 'Today'],
  [7, '7 days'],
  [30, '30 days'],
] as const;
const { strongPct, fairPct, minViewers } = CONFIG.analytics.attraction;

export default async function Visitors({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/analytics', roles: ['admin'] });
  const asked = Number((await searchParams).range);
  const range = RANGES.find((r) => r[0] === asked)?.[0] ?? 7;
  const now = Date.now();
  const [list, top, stored] = await Promise.all([days(14, now), overview(dayOf(now - (range - 1) * DAY_MS), dayOf(now)), reportDays()]);
  const today = list[list.length - 1];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-analytics" title="Visitors">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Today so far</h2>
            <p className="sub">
              Days run on UTC time, like the Risk page. A visitor is one browser on one connection, counted once a day; a repeat visitor was here on an earlier day too. No cookie is used, and bots and
              browsers that ask not to be tracked are not counted.
            </p>
          </div>
        </div>
        <div className="strip">
          <div>
            <small>Visitors</small>
            <b>{today.visitors}</b>
          </div>
          <div>
            <small>Repeat visitors</small>
            <b>{today.repeat}</b>
          </div>
          <div>
            <small>Product opens</small>
            <b>{today.products}</b>
          </div>
          <div>
            <small>Buy clicks</small>
            <b>{today.buys}</b>
          </div>
        </div>
        <h3 className="an-h">Last 14 days</h3>
        <DaysTable days={list} />
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>What draws people</h2>
            <p className="sub">The most opened products, categories and pages for the days you pick.</p>
          </div>
          <div className="an-range" role="group" aria-label="Days">
            {RANGES.map(([n, label]) => (
              <Link key={n} href={`/dashboard/admin/analytics?range=${n}`} className={n === range ? 'btn btn-dark btn-sm' : 'btn btn-line btn-sm'} aria-current={n === range ? 'true' : undefined}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <h3 className="an-h">Most opened products</h3>
        <TopTable rows={top.products} what="Product" link={(k) => `/product/${k}`} />
        <h3 className="an-h">Most opened categories</h3>
        <TopTable rows={top.categories} what="Category" />
        <h3 className="an-h">Product attraction</h3>
        <p className="sub">
          How many different people opened each product, and what share of them clicked Buy. Strong is {strongPct}% or more, fair is {fairPct}% or more; under {minViewers} people is too few to judge.
        </p>
        <AttractionTable rows={top.attraction} />
        <h3 className="an-h">Most opened pages</h3>
        <TopTable rows={top.pages.map((p) => ({ ...p, name: p.key }))} what="Page" />
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Daily reports</h2>
            <p className="sub">
              Made once a day for the day before by the scheduled job, which also sends the admins a short summary. Each report has every number above for its day and the site&apos;s activity (new
              accounts, orders, disputes, refunds, abuse reports, failed payments), and downloads as a spreadsheet. Rows older than {CONFIG.analytics.keepDays} days are deleted.
            </p>
          </div>
        </div>
        <ul className="lst">
          <li>
            <Link className="link-u" href={`/dashboard/admin/analytics/report?day=${today.day}`}>
              Today so far ({today.day})
            </Link>
          </li>
          {stored.map((d) => (
            <li key={d}>
              <Link className="link-u" href={`/dashboard/admin/analytics/report?day=${d}`}>
                {d}
              </Link>
            </li>
          ))}
          {stored.length === 0 && <li className="muted">No stored reports yet. The first one is made the day after visitors start being counted.</li>}
        </ul>
      </div>
    </DashShell>
  );
}
