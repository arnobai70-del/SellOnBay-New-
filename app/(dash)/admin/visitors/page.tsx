import type { Metadata } from 'next';
import { Bars } from '@/components/charts';
import { AdminShell } from '@/components/glass/AdminShell';
import { DataTable } from '@/components/glass/DataTable';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { dayOf } from '@/lib/analyticsCore';
import { COUNTRY_NAME } from '@/lib/countries';
import { gaVisitors } from '@/lib/ga4Visitors';
import type { Named } from '@/lib/ga4VisitorsCore';
import { pageCountSummary } from '@/lib/pageCounts';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Visitors', robots: { index: false } };
export const dynamic = 'force-dynamic';

const trend = (n: number | null) => (n === null ? 'No earlier figure' : `${n >= 0 ? 'Up' : 'Down'} ${Math.abs(n)}% on the period before`);
const short = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function NamedTable({ caption, rows, label, value = 'Users' }: { caption: string; rows: Named[]; label: string; value?: string }) {
  return (
    <DataTable<Named>
      caption={caption}
      rows={rows}
      rowKey={(r) => r.name}
      empty="No data yet."
      columns={[
        { key: 'name', label, cell: (r) => r.name },
        { key: 'n', label: value, cell: (r) => r.n.toLocaleString('en-US') },
      ]}
    />
  );
}

/*
 * Admin › System › Visitors (owner, 2026-11-08). GA4 through the Data API with a service account, cached 15 minutes; without it, a "Connect GA4"
 * card. Beside it the cookieless first-party count (page and country a day, nothing about a person), which is approximate.
 */
export default async function AdminVisitors() {
  const viewer = await requireViewer({ path: '/admin/visitors', roles: ['admin'], scope: 'content' });
  const now = Date.now();
  const [ga, own] = await Promise.all([gaVisitors(), pageCountSummary(dayOf(now - 29 * 86_400_000), dayOf(now))]);
  return (
    <AdminShell viewer={viewer} active="visitors" title="Visitors" subtitle="Google Analytics counts only visitors who accepted analytics.">
      {ga.state === 'not_connected' && (
        <GlassCard as="section">
          <h2>Connect GA4</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Add GA4_PROPERTY_ID (the property&apos;s number) and GA4_SERVICE_ACCOUNT_JSON (a service account key with Viewer access to the property) to the server environment. Then visitors,
            countries, pages, devices and clicked sections show here. Clicks by section need a custom dimension &quot;section&quot; (event scope) in GA4.
          </p>
        </GlassCard>
      )}
      {ga.state === 'error' && (
        <GlassCard as="section" role="alert">
          <h2>Google Analytics did not answer</h2>
          <p className="g-muted" style={{ marginTop: 8 }}>
            {ga.note}
          </p>
        </GlassCard>
      )}
      {ga.state === 'ok' && (
        <>
          <div className="g-kpis">
            <Kpi label="Today" value={ga.report.today} note="Users" />
            <Kpi label="Last 7 days" value={ga.report.last7} note={trend(ga.report.trend7)} />
            <Kpi label="Last 30 days" value={ga.report.last30} note={trend(ga.report.trend30)} />
            <Kpi label="New / returning" value={ga.report.newVsReturning.map((x) => x.n).join(' / ') || '-'} note="Last 30 days" />
          </div>
          <GlassCard as="section">
            <h2>Users a day, last 30 days</h2>
            {ga.report.daily.some((d) => d.users > 0) && <Bars label="Users a day" data={ga.report.daily.slice(30).map((d) => [short(d.day), d.users] as [string, number])} />}
            <p className="g-tag">From Google Analytics, {new Date(ga.fetchedAt).toISOString().slice(11, 16)} UTC. Refreshed every 15 minutes.</p>
          </GlassCard>
          <div className="g-grid2">
            <GlassCard as="section">
              <h2>Top countries</h2>
              {ga.report.countries.some((c) => c.n > 0) && <Bars label="Users by country" data={ga.report.countries.slice(0, 8).map((c) => [c.name, c.n] as [string, number])} />}
              <NamedTable caption="Top countries" rows={ga.report.countries} label="Country" />
            </GlassCard>
            <GlassCard as="section">
              <h2>Devices</h2>
              <NamedTable caption="Devices" rows={ga.report.devices} label="Device" />
              <h2 style={{ marginTop: 16 }}>Clicked sections</h2>
              {Array.isArray(ga.sections) ? <NamedTable caption="Clicked sections" rows={ga.sections} label="Section" value="Clicks" /> : <p className="g-tag">{ga.sections.note}</p>}
            </GlassCard>
          </div>
          <GlassCard as="section">
            <h2>Top pages</h2>
            <NamedTable caption="Top pages" rows={ga.report.pages} label="Page" value="Views" />
          </GlassCard>
        </>
      )}
      <GlassCard as="section">
        <h2>Our own count (approximate)</h2>
        <p className="g-tag">
          Counted on our server without cookies: the page and the country a day, nothing about a person. Browsers that ask not to be tracked are not counted. A country shows when the host&apos;s geo
          header is trusted (FIRST_PARTY_COUNTRY_TRUSTED), else &quot;--&quot;.
        </p>
        <div className="g-kpis" style={{ marginTop: 10 }}>
          <Kpi label="Page opens, 30 days" value={own.total.toLocaleString('en-US')} note="Approximate" />
          <Kpi label="Today" value={own.days.find((d) => d.day === dayOf(now))?.n ?? 0} note="Approximate" />
        </div>
        {own.days.some((d) => d.n > 0) && <Bars label="Page opens a day" data={own.days.map((d) => [short(d.day), d.n] as [string, number])} />}
        <div className="g-grid2" style={{ marginTop: 10 }}>
          <NamedTable caption="Pages, our count" rows={own.pages.map((p) => ({ name: p.path, n: p.n }))} label="Page" value="Opens" />
          <NamedTable
            caption="Countries, our count"
            rows={own.countries.map((c) => ({ name: c.code === '--' ? 'Not known' : (COUNTRY_NAME[c.code] ?? c.code), n: c.n }))}
            label="Country"
            value="Opens"
          />
        </div>
      </GlassCard>
    </AdminShell>
  );
}
