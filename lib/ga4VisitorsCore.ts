/*
 * Admin › System › Visitors (owner, 2026-11-08): what is asked of the GA4 Data API and how its answers are read. Pure, tested.
 * One batchRunReports call with five reports, and one runReport for the section clicks (a custom dimension the owner registers in GA4).
 */
type Dim = { name: string };
type Report = { dateRanges: { startDate: string; endDate: string }[]; dimensions: Dim[]; metrics: { name: string }[]; limit?: number; orderBys?: unknown[]; dimensionFilter?: unknown };
const range30 = { startDate: '29daysAgo', endDate: 'today' };
const desc = (metric: string) => [{ metric: { metricName: metric }, desc: true }];

export function visitorReports(): Report[] {
  return [
    { dateRanges: [{ startDate: '59daysAgo', endDate: 'today' }], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }], limit: 70 },
    { dateRanges: [range30], dimensions: [{ name: 'newVsReturning' }], metrics: [{ name: 'activeUsers' }] },
    { dateRanges: [range30], dimensions: [{ name: 'country' }], metrics: [{ name: 'activeUsers' }], limit: 10, orderBys: desc('activeUsers') },
    { dateRanges: [range30], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], limit: 10, orderBys: desc('screenPageViews') },
    { dateRanges: [range30], dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }], orderBys: desc('activeUsers') },
  ];
}
export function sectionReport(): Report {
  return {
    dateRanges: [range30],
    dimensions: [{ name: 'customEvent:section' }],
    metrics: [{ name: 'eventCount' }],
    limit: 10,
    orderBys: desc('eventCount'),
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'section_click' } } },
  };
}

type Raw = { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };
const num = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0;
};
const rowsOf = (r: unknown) => ((r as Raw)?.rows ?? []).map((x) => ({ k: String(x.dimensionValues?.[0]?.value ?? ''), v: (x.metricValues ?? []).map((m) => num(m.value)) }));
const iso = (yyyymmdd: string) => (/^\d{8}$/.test(yyyymmdd) ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}` : '');

export type Named = { name: string; n: number };
export type VisitorReport = {
  daily: { day: string; users: number; fresh: number }[]; // the last 60 days, oldest first
  today: number;
  last7: number;
  last30: number;
  trend7: number | null; // change against the 7 days before, in percent
  trend30: number | null;
  newVsReturning: Named[];
  countries: Named[];
  pages: Named[];
  devices: Named[];
};

/* Users a day are summed for 7 and 30 days, which counts a person once a day: it is the same "approximate" figure GA shows for a range of days. */
export function readVisitors(reports: unknown[], today: string): VisitorReport {
  const byDay = new Map(rowsOf(reports[0]).map((r) => [iso(r.k), { users: r.v[0] ?? 0, fresh: r.v[1] ?? 0 }]));
  const days: string[] = [];
  const end = Date.parse(today + 'T00:00:00Z');
  for (let i = 59; i >= 0; i--) days.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  const daily = days.map((day) => ({ day, ...(byDay.get(day) ?? { users: 0, fresh: 0 }) }));
  const sum = (from: number, to: number) => daily.slice(from, to).reduce((s, d) => s + d.users, 0);
  const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
  const named = (r: unknown) => rowsOf(r).map((x) => ({ name: x.k || '(not set)', n: x.v[0] ?? 0 }));
  const last7 = sum(53, 60),
    last30 = sum(30, 60);
  return {
    daily,
    today: daily[59].users,
    last7,
    last30,
    trend7: pct(last7, sum(46, 53)),
    trend30: pct(last30, sum(0, 30)),
    newVsReturning: named(reports[1]).filter((x) => x.name === 'new' || x.name === 'returning'),
    countries: named(reports[2]),
    pages: named(reports[3]),
    devices: named(reports[4]),
  };
}
export const readSections = (report: unknown): Named[] => rowsOf(report).map((x) => ({ name: x.k || '(not set)', n: x.v[0] ?? 0 }));
