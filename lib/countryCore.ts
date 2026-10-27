/*
 * Country analytics (SellOnBay 2.0, Blueprint 8.1, O-5, R-1). Pure, tested. Two sources, always shown apart and NEVER added together:
 *   GA4          Google's own country, for consenting visitors only (G-FEK9C0CM04), read through the GA4 Data API (blocker B-5)
 *   first-party  a two-letter code from a trusted proxy header, per keyed visitor hash and day, no address stored (blocker B-12)
 */
export type Ga4CountryRow = { country: string; code: string; users: number; sessions: number; views: number; keyEvents: number };
export type FirstPartyCountryRow = { code: string; visitors: number };

/* Proxy headers we know carry a country decided by the proxy itself. Which one is used, and whether it is trusted, is server configuration. */
export const COUNTRY_HEADERS = ['cf-ipcountry', 'x-vercel-ip-country', 'cloudfront-viewer-country'] as const;
const NOT_A_COUNTRY = new Set(['XX', 'T1', 'A1', 'A2', 'O1', 'EU', 'AP', 'ZZ']);

/*
 * The country of a request, or null. Only when the server is told which header its proxy sets AND that the proxy overwrites any copy sent
 * by the browser (FIRST_PARTY_COUNTRY_TRUSTED=1): otherwise a visitor could write any country they like.
 */
export function trustedCountry(headers: { get(name: string): string | null }, env: Record<string, string | undefined>): string | null {
  const name = (env.FIRST_PARTY_COUNTRY_HEADER ?? '').toLowerCase();
  if (env.FIRST_PARTY_COUNTRY_TRUSTED !== '1' || !(COUNTRY_HEADERS as readonly string[]).includes(name)) return null;
  const v = (headers.get(name) ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) && !NOT_A_COUNTRY.has(v) ? v : null;
}

/* Reads a GA4 Data API runReport answer (dimensions country, countryId; metrics activeUsers, sessions, screenPageViews, keyEvents). */
export function parseGa4Report(json: unknown): Ga4CountryRow[] {
  const rows = (json as { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] })?.rows ?? [];
  const n = (v: string | undefined) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0;
  };
  return rows
    .map((r) => ({
      country: String(r.dimensionValues?.[0]?.value ?? '(not set)').slice(0, 80),
      code: String(r.dimensionValues?.[1]?.value ?? '')
        .slice(0, 2)
        .toUpperCase(),
      users: n(r.metricValues?.[0]?.value),
      sessions: n(r.metricValues?.[1]?.value),
      views: n(r.metricValues?.[2]?.value),
      keyEvents: n(r.metricValues?.[3]?.value),
    }))
    .sort((a, b) => b.users - a.users || a.country.localeCompare(b.country));
}

/* The request body for one runReport call. Dates are YYYY-MM-DD (UTC days, like the rest of the admin analytics). */
export const ga4ReportBody = (from: string, to: string, limit = 250) => ({
  dateRanges: [{ startDate: from, endDate: to }],
  dimensions: [{ name: 'country' }, { name: 'countryId' }],
  metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'keyEvents' }],
  orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
  limit,
});

/* The last n UTC days, today included. */
export function lastDays(n: number, now = Date.now()): { from: string; to: string } {
  return { from: new Date(now - (n - 1) * 86_400_000).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) };
}
