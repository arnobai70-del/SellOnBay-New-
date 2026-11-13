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

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
import type { Tx } from '@/lib/i18n/tx';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Visitors'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const trend = (n: number | null, tx: Tx) => (n === null ? tx('No earlier figure') : `${n >= 0 ? 'Up' : 'Down'} ${Math.abs(n)}% on the period before`);
const short = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

async function NamedTable({ caption, rows, label, value: given }: { caption: string; rows: Named[]; label: string; value?: string }) {
  const { tx } = await getI18n();
  const value = given ?? tx('Users');
  return (
    <DataTable<Named>
      caption={caption}
      rows={rows}
      rowKey={(r) => r.name}
      empty={tx('No data yet.')}
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
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/visitors', roles: ['admin'], scope: 'content' });
  const now = Date.now();
  const [ga, own] = await Promise.all([gaVisitors(), pageCountSummary(dayOf(now - 29 * 86_400_000), dayOf(now))]);
  return (
    <AdminShell viewer={viewer} active="visitors" title={tx('Visitors')} subtitle={tx('Google Analytics counts only visitors who accepted analytics.')}>
      {ga.state === 'not_connected' && (
        <GlassCard as="section">
          <h2>
            <T s={'Connect GA4'} />
          </h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            <T
              s={
                'Add GA4_PROPERTY_ID (the property\'s number) and GA4_SERVICE_ACCOUNT_JSON (a service account key with Viewer access to the property) to the server environment. Then visitors, countries, pages, devices and clicked sections show here. Clicks by section need a custom dimension "section" (event scope) in GA4.'
              }
            />
          </p>
        </GlassCard>
      )}
      {ga.state === 'error' && (
        <GlassCard as="section" role="alert">
          <h2>
            <T s={'Google Analytics did not answer'} />
          </h2>
          <p className="muted" style={{ marginTop: 8 }}>
            {ga.note}
          </p>
        </GlassCard>
      )}
      {ga.state === 'ok' && (
        <>
          <div className="kpis">
            <Kpi label={tx('Today')} value={ga.report.today} note={tx('Users')} />
            <Kpi label={tx('Last 7 days')} value={ga.report.last7} note={trend(ga.report.trend7, tx)} />
            <Kpi label={tx('Last 30 days')} value={ga.report.last30} note={trend(ga.report.trend30, tx)} />
            <Kpi label={tx('New / returning')} value={ga.report.newVsReturning.map((x) => x.n).join(' / ') || '-'} note={tx('Last 30 days')} />
          </div>
          <GlassCard as="section">
            <h2>
              <T s={'Users a day, last 30 days'} />
            </h2>
            {ga.report.daily.some((d) => d.users > 0) && <Bars label={tx('Users a day')} data={ga.report.daily.slice(30).map((d) => [short(d.day), d.users] as [string, number])} />}
            <p className="tag">
              <T s={'From Google Analytics, {v0} UTC. Refreshed every 15 minutes.'} v={{ v0: new Date(ga.fetchedAt).toISOString().slice(11, 16) }} />
            </p>
          </GlassCard>
          <div className="grid2">
            <GlassCard as="section">
              <h2>
                <T s={'Top countries'} />
              </h2>
              {ga.report.countries.some((c) => c.n > 0) && <Bars label={tx('Users by country')} data={ga.report.countries.slice(0, 8).map((c) => [c.name, c.n] as [string, number])} />}
              <NamedTable caption={tx('Top countries')} rows={ga.report.countries} label={tx('Country')} />
            </GlassCard>
            <GlassCard as="section">
              <h2>
                <T s={'Devices'} />
              </h2>
              <NamedTable caption={tx('Devices')} rows={ga.report.devices} label={tx('Device')} />
              <h2 style={{ marginTop: 16 }}>
                <T s={'Clicked sections'} />
              </h2>
              {Array.isArray(ga.sections) ? <NamedTable caption={tx('Clicked sections')} rows={ga.sections} label={tx('Section')} value="Clicks" /> : <p className="tag">{ga.sections.note}</p>}
            </GlassCard>
          </div>
          <GlassCard as="section">
            <h2>
              <T s={'Top pages'} />
            </h2>
            <NamedTable caption={tx('Top pages')} rows={ga.report.pages} label={tx('Page')} value="Views" />
          </GlassCard>
        </>
      )}
      <GlassCard as="section">
        <h2>
          <T s={'Our own count (approximate)'} />
        </h2>
        <p className="tag">
          <T
            s={
              'Counted on our server without cookies: the page and the country a day, nothing about a person. Browsers that ask not to be tracked are not counted. A country shows when the host\'s geo header is trusted (FIRST_PARTY_COUNTRY_TRUSTED), else "--".'
            }
          />
        </p>
        <div className="kpis" style={{ marginTop: 10 }}>
          <Kpi label={tx('Page opens, 30 days')} value={own.total.toLocaleString('en-US')} note={tx('Approximate')} />
          <Kpi label={tx('Today')} value={own.days.find((d) => d.day === dayOf(now))?.n ?? 0} note={tx('Approximate')} />
        </div>
        {own.days.some((d) => d.n > 0) && <Bars label={tx('Page opens a day')} data={own.days.map((d) => [short(d.day), d.n] as [string, number])} />}
        <div className="grid2" style={{ marginTop: 10 }}>
          <NamedTable caption={tx('Pages, our count')} rows={own.pages.map((p) => ({ name: p.path, n: p.n }))} label={tx('Page')} value="Opens" />
          <NamedTable
            caption={tx('Countries, our count')}
            rows={own.countries.map((c) => ({ name: c.code === '--' ? tx('Not known') : (COUNTRY_NAME[c.code] ?? c.code), n: c.n }))}
            label={tx('Country')}
            value="Opens"
          />
        </div>
      </GlassCard>
    </AdminShell>
  );
}
