import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { firstPartyCountries } from '@/lib/countryAnalytics';
import { lastDays } from '@/lib/countryCore';
import { isFlagOn } from '@/lib/featureFlags';
import { ga4Countries } from '@/lib/ga4Country';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Visitors by country', robots: { index: false } };
export const dynamic = 'force-dynamic';

const RANGES = [7, 30, 90] as const;

/*
 * Two separate country panels (Blueprint 8.1, O-5): GA4 (consenting visitors only, Google's own country) and first-party (all non-bot
 * visitors without GPC/DNT, a code from a trusted proxy header). They count different people in different ways, so there is never a combined
 * total on this page or anywhere else.
 */
export default async function Countries({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/visitors/countries', roles: ['admin'], scope: ['content', 'finance'] });
  const d = Number((await searchParams).d);
  const days = (RANGES as readonly number[]).includes(d) ? d : 30;
  const { from, to } = lastDays(days);
  const ga4 = await ga4Countries(from, to);
  const fpOn = await isFlagOn('analytics.first_party_country');
  const fp = fpOn ? await firstPartyCountries(from, to) : [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-countries" title={tx('Visitors by country')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Visitors by country'} />
            </h2>
            <p className="tag">
              <T s={'{from} to {to} (UTC).'} v={{ from, to }} />{' '}
              {RANGES.map((r) => (
                <a key={r} href={`?d=${r}`} aria-current={r === days ? 'page' : undefined} style={{ marginRight: 8 }}>
                  <T s={'{r} days'} v={{ r }} />
                </a>
              ))}
            </p>
            <p className="muted">
              <T
                s={
                  'The two panels count different people, so their numbers differ and are never added together. GA4 counts only visitors who accepted analytics, whose browser ran the script and who were not blocked; a visitor is a browser cookie. First-party counts every visitor without Do Not Track or Global Privacy Control; a visitor is a keyed hash of address and browser per day, so a new device is a new visitor. GA4 can also hide very small numbers.'
                }
              />
            </p>
          </div>
        </div>
      </div>

      <div className="glass card sob-sec" data-country-source="ga4">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'From GA4 (consenting visitors only)'} />
            </h2>
            <p className="tag">
              <T s={'Read from the GA4 property behind G-FEK9C0CM04 through the GA4 Data API.'} />
            </p>
          </div>
        </div>
        {ga4.state !== 'ok' ? (
          <p className="muted">{ga4.note}</p>
        ) : ga4.rows.length === 0 ? (
          <p className="muted">
            <T s={'No GA4 data for these days.'} />
          </p>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">
                    <T s={'Country'} />
                  </th>
                  <th scope="col">
                    <T s={'Users'} />
                  </th>
                  <th scope="col">
                    <T s={'Sessions'} />
                  </th>
                  <th scope="col">
                    <T s={'Page views'} />
                  </th>
                  <th scope="col">
                    <T s={'Key events'} />
                  </th>
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
            <small className="muted">
              <T s={'Last updated {v0} UTC (kept for an hour).'} v={{ v0: new Date(ga4.fetchedAt).toISOString().slice(0, 16).replace('T', ' ') }} />
            </small>
          </>
        )}
      </div>

      <div className="glass card sob-sec" data-country-source="first-party">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={"First-party (SellOnBay's own count)"} />
            </h2>
            <p className="tag">
              <T s={'A two-letter country per visitor per day from the proxy in front of the site. No address is stored.'} />
            </p>
          </div>
        </div>
        {!fpOn ? (
          <p className="muted">
            <T s={'Switched off. It waits for legal and privacy approval (blocker B-12) and a trusted proxy country header on the server.'} />
          </p>
        ) : fp.length === 0 ? (
          <p className="muted">
            <T s={'No visitors counted by country for these days.'} />
          </p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">
                  <T s={'Country code'} />
                </th>
                <th scope="col">
                  <T s={'Visitors'} />
                </th>
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
