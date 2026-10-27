import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { firstPartyCountries } from '@/lib/countryAnalytics';
import { lastDays } from '@/lib/countryCore';
import { isFlagOn } from '@/lib/featureFlags';
import { ga4Countries } from '@/lib/ga4Country';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Visitors by country', robots: { index: false } };
export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90] as const;

/*
 * Two separate country panels (Blueprint 8.1, O-5): GA4 (consenting visitors only, Google's own country) and first-party (all non-bot
 * visitors without GPC/DNT, a code from a trusted proxy header). They count different people in different ways, so there is never a combined
 * total on this page or anywhere else.
 */
export default async function Countries({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/analytics/countries', roles: ['admin'], scope: ['content', 'finance'] });
  const d = Number((await searchParams).d);
  const days = (RANGES as readonly number[]).includes(d) ? d : 30;
  const { from, to } = lastDays(days);
  const ga4 = await ga4Countries(from, to);
  const fpOn = await isFlagOn('analytics.first_party_country');
  const fp = fpOn ? await firstPartyCountries(from, to) : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-countries" title="Visitors by country">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Visitors by country</h2>
            <p className="sub">
              {from} to {to} (UTC).{' '}
              {RANGES.map((r) => (
                <a key={r} href={`?d=${r}`} aria-current={r === days ? 'page' : undefined} style={{ marginRight: 8 }}>
                  {r} days
                </a>
              ))}
            </p>
            <p className="muted">
              The two panels count different people, so their numbers differ and are never added together. GA4 counts only visitors who accepted analytics, whose browser ran the script and who were
              not blocked; a visitor is a browser cookie. First-party counts every visitor without Do Not Track or Global Privacy Control; a visitor is a keyed hash of address and browser per day, so
              a new device is a new visitor. GA4 can also hide very small numbers.
            </p>
          </div>
        </div>
      </div>

      <div className="dp" data-country-source="ga4">
        <div className="hd">
          <div>
            <h2>From GA4 (consenting visitors only)</h2>
            <p className="sub">Read from the GA4 property behind G-FEK9C0CM04 through the GA4 Data API.</p>
          </div>
        </div>
        {ga4.state !== 'ok' ? (
          <p className="muted">{ga4.note}</p>
        ) : ga4.rows.length === 0 ? (
          <p className="muted">No GA4 data for these days.</p>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Country</th>
                  <th scope="col">Users</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Page views</th>
                  <th scope="col">Key events</th>
                </tr>
              </thead>
              <tbody>
                {ga4.rows.map((r) => (
                  <tr key={r.country + r.code}>
                    <td>{r.country}</td>
                    <td>{r.users}</td>
                    <td>{r.sessions}</td>
                    <td>{r.views}</td>
                    <td>{r.keyEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="muted">Last updated {new Date(ga4.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC (kept for an hour).</small>
          </>
        )}
      </div>

      <div className="dp" data-country-source="first-party">
        <div className="hd">
          <div>
            <h2>First-party (SellOnBay&apos;s own count)</h2>
            <p className="sub">A two-letter country per visitor per day from the proxy in front of the site. No address is stored.</p>
          </div>
        </div>
        {!fpOn ? (
          <p className="muted">Switched off. It waits for legal and privacy approval (blocker B-12) and a trusted proxy country header on the server.</p>
        ) : fp.length === 0 ? (
          <p className="muted">No visitors counted by country for these days.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Country code</th>
                <th scope="col">Visitors</th>
              </tr>
            </thead>
            <tbody>
              {fp.map((r) => (
                <tr key={r.code}>
                  <td>{r.code}</td>
                  <td>{r.visitors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashShell>
  );
}
