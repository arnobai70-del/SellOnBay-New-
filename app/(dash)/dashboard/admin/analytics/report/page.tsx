import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AttractionTable, CompareTable, TopTable } from '@/components/AnalyticsTables';
import { DashShell } from '@/components/DashShell';
import { buildReport, savedReport } from '@/lib/analytics';
import { dayOf } from '@/lib/analyticsCore';
import { METRICS, METRIC_LABEL } from '@/lib/metrics';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Daily report', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function DailyReport({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/analytics/report', roles: ['admin'] });
  const day = (await searchParams).day ?? dayOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) notFound();
  const saved = await savedReport(day);
  const r = saved ?? (await buildReport(day));
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-analytics" title={`Daily report ${day}`}>
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Visitors on {day}</h2>
            <p className="sub">
              {saved
                ? `Stored by the daily job on ${new Date(saved.madeAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.`
                : 'Built now from the counts so far; the daily job stores it the day after.'}{' '}
              Days run on UTC time.
            </p>
          </div>
          <div className="an-range">
            <Link href="/dashboard/admin/analytics" className="btn btn-line btn-sm">
              All visitors
            </Link>
            <a href={`/api/admin/analytics/report?day=${day}`} className="btn btn-dark btn-sm" download>
              Download spreadsheet
            </a>
          </div>
        </div>
        <CompareTable today={r.totals} before={r.dayBefore} />
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Site activity</h2>
            <p className="sub">What happened on the site that day, from the same counters as the Risk page.</p>
          </div>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <tbody>
              {METRICS.map((m) => (
                <tr key={m}>
                  <td>{METRIC_LABEL[m]}</td>
                  <td>
                    <b>{r.activity[m] ?? 0}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>What drew people</h2>
          </div>
        </div>
        <h3 className="an-h">Most opened products</h3>
        <TopTable rows={r.products} what="Product" link={(k) => `/product/${k}`} />
        <h3 className="an-h">Most opened categories</h3>
        <TopTable rows={r.categories} what="Category" />
        <h3 className="an-h">Product attraction</h3>
        <AttractionTable rows={r.attraction} />
        <h3 className="an-h">Most opened pages</h3>
        <TopTable rows={r.pages.map((p) => ({ ...p, name: p.key }))} what="Page" />
      </div>
    </DashShell>
  );
}
