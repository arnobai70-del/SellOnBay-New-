import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AttractionTable, CompareTable, TopTable } from '@/components/AnalyticsTables';
import { DashShell } from '@/components/DashShell';
import { buildReport, savedReport } from '@/lib/analytics';
import { dayOf } from '@/lib/analyticsCore';
import { METRICS, METRIC_LABEL } from '@/lib/metrics';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Daily report'), robots: { index: false } });
export const dynamic = 'force-dynamic';

export default async function DailyReport({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const viewer = await requireViewer({ path: '/admin/visitors/report', roles: ['admin'], scope: ['content', 'finance'] });
  const day = (await searchParams).day ?? dayOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) notFound();
  const saved = await savedReport(day);
  const r = saved ?? (await buildReport(day));
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-analytics" title={`Daily report ${day}`}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Visitors on {day}'} v={{ day }} />
            </h2>
            <p className="tag">
              <T
                s={'{v0} Days run on UTC time.'}
                v={{
                  v0: saved
                    ? `Stored by the daily job on ${new Date(saved.madeAt).toISOString().slice(0, 16).replace('T', ' ')} UTC.`
                    : 'Built now from the counts so far; the daily job stores it the day after.',
                }}
              />
            </p>
          </div>
          <div className="sob-an-range">
            <Link href="/admin/visitors/details" className="btn ghost sm">
              <T s={'All visitors'} />
            </Link>
            <a href={`/api/admin/analytics/report?day=${day}`} className="btn sm" download>
              <T s={'Download spreadsheet'} />
            </a>
          </div>
        </div>
        <CompareTable today={r.totals} before={r.dayBefore} />
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Site activity'} />
            </h2>
            <p className="tag">
              <T s={'What happened on the site that day, from the same counters as the Risk page.'} />
            </p>
          </div>
        </div>
        <div className="tbl">
          <table className="">
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

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'What drew people'} />
            </h2>
          </div>
        </div>
        <h3 className="sob-an-h">
          <T s={'Most opened products'} />
        </h3>
        <TopTable rows={r.products} what="Product" link={(k) => `/product/${k}`} />
        <h3 className="sob-an-h">
          <T s={'Most opened categories'} />
        </h3>
        <TopTable rows={r.categories} what="Category" />
        <h3 className="sob-an-h">
          <T s={'Product attraction'} />
        </h3>
        <AttractionTable rows={r.attraction} />
        <h3 className="sob-an-h">
          <T s={'Most opened pages'} />
        </h3>
        <TopTable rows={r.pages.map((p) => ({ ...p, name: p.key }))} what="Page" />
      </div>
    </DashShell>
  );
}
