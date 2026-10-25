import { CONFIG } from './config';

/*
 * The pure half of visitor analytics (lib/analytics.ts stores it): what a page open or a click counts as, who is a bot, and the sums the admin
 * page shows. The in-memory store (demo mode) uses the same sums as the database functions in migration 0052, and the tests check both agree.
 */
export type Event = 'visit' | 'page' | 'product' | 'category' | 'buy';
export const EVENTS: readonly Event[] = ['visit', 'page', 'product', 'category', 'buy'];
export type Hit = { event: Event; key: string };
export type Row = { day: string; visitor: string; event: Event; key: string; n: number };
export type DayLine = { day: string; visitors: number; repeat: number; fresh: number; pages: number; products: number; categories: number; buys: number };
export type Top = { key: string; total: number; people: number };
export type Attraction = { key: string; views: number; viewers: number; buys: number; buyers: number; pct: number; level: 'strong' | 'fair' | 'weak' | 'few' };

export const MAX_REPEATS = 50; // the same visitor, day, event and key counts at most this many times (as in the database)
export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|facebookexternalhit|embedly|curl|wget|python|httpclient|okhttp|java\/|go-http|axios|node-fetch/i;
export const isBot = (ua: string | null | undefined) => !ua || ua.length < 20 || BOT.test(ua);

const KEY = /^[\p{L}\p{N} .,&'()+:_/-]{1,120}$/u;
export function cleanKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return null;
  }
  v = v.trim();
  return KEY.test(v) ? v : null;
}
export const PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

/* Shelf slug in a category key -> what the admin reads. */
export const SHELF_NAMES: Record<string, string> = {
  websites: 'Websites',
  templates: 'Templates',
  android: 'Android apps',
  ios: 'iPhone & iPad apps',
  web: 'Web apps',
  desktop: 'Desktop apps',
  digital: 'Digital products',
  topic: 'Digital topic',
};
export function categoryLabel(key: string): string {
  const at = key.indexOf(':');
  const shelf = SHELF_NAMES[key.slice(0, at)];
  return shelf ? `${key.slice(at + 1)} (${shelf})` : key;
}

/* Pages whose last part is an id: counted under one name so the list of pages stays readable. */
const COLLAPSE = /^\/(product|orders|pay|preview)\/[^/]+/;

/* What opening one page counts: a visit, the page, and the product or category it shows. */
export function hitsForPage(path: string, search = ''): Hit[] {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9._~%/-]{0,200}$/.test(path)) return [];
  const p = path.replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const hits: Hit[] = [{ event: 'visit', key: '' }];
  const collapsed = COLLAPSE.exec(p);
  hits.push({ event: 'page', key: collapsed ? `/${collapsed[1]}/*` : p.slice(0, 120) });
  const product = /^\/product\/([^/]+)$/.exec(p);
  if (product && PRODUCT_ID.test(product[1])) hits.push({ event: 'product', key: product[1] });
  const cat = (shelf: string, raw: string | null) => {
    const c = cleanKey(raw);
    if (c && c !== 'All') hits.push({ event: 'category', key: `${shelf}:${c}` });
  };
  if (p === '/browse') cat('websites', q.get('cat'));
  const app = /^\/apps\/(android|ios|web|desktop|digital)$/.exec(p);
  if (app) {
    cat(app[1], q.get('cat'));
    if (app[1] === 'digital') cat('topic', q.get('topic'));
  }
  const page = /^\/(websites|templates)\/([^/]+)$/.exec(p);
  if (page) cat(page[1], page[2]);
  return hits;
}

/* A click on a Buy link (/checkout?id=...). */
export function hitForBuy(id: unknown): Hit | null {
  return typeof id === 'string' && PRODUCT_ID.test(id) ? { event: 'buy', key: id } : null;
}

/* --- the sums, for the in-memory store (the database runs the same in analytics_days and analytics_top) --- */

export function addHit(rows: Map<string, Row>, firsts: Map<string, string>, day: string, visitor: string, hit: Hit): void {
  const id = `${day}|${hit.event}|${hit.key}|${visitor}`;
  const row = rows.get(id);
  if (row) row.n = Math.min(row.n + 1, MAX_REPEATS);
  else rows.set(id, { day, visitor, event: hit.event, key: hit.key, n: 1 });
  const first = firsts.get(visitor);
  if (!first || day < first) firsts.set(visitor, day);
}

export function emptyDay(day: string): DayLine {
  return { day, visitors: 0, repeat: 0, fresh: 0, pages: 0, products: 0, categories: 0, buys: 0 };
}

export function sumDays(rows: Iterable<Row>, firsts: Map<string, string>, from: string, to: string): Map<string, DayLine> {
  const out = new Map<string, DayLine>();
  for (const r of rows) {
    if (r.day < from || r.day > to) continue;
    const d = out.get(r.day) ?? emptyDay(r.day);
    out.set(r.day, d);
    if (r.event === 'visit') {
      d.visitors++;
      if ((firsts.get(r.visitor) ?? r.day) < r.day) d.repeat++;
    } else if (r.event === 'page') d.pages += r.n;
    else if (r.event === 'product') d.products += r.n;
    else if (r.event === 'category') d.categories += r.n;
    else if (r.event === 'buy') d.buys += r.n;
  }
  for (const d of out.values()) d.fresh = d.visitors - d.repeat;
  return out;
}

export function sumTop(rows: Iterable<Row>, event: Event, from: string, to: string, limit: number): Top[] {
  const by = new Map<string, { total: number; people: Set<string> }>();
  for (const r of rows) {
    if (r.event !== event || r.day < from || r.day > to) continue;
    const t = by.get(r.key) ?? { total: 0, people: new Set<string>() };
    t.total += r.n;
    t.people.add(r.visitor);
    by.set(r.key, t);
  }
  return [...by]
    .map(([key, t]) => ({ key, total: t.total, people: t.people.size }))
    .sort((a, b) => b.total - a.total || b.people - a.people || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/* How much each product draws: how many people opened it, and what share of them clicked Buy. */
export function attraction(views: Top[], buys: Top[], rules: { minViewers: number; strongPct: number; fairPct: number } = CONFIG.analytics.attraction): Attraction[] {
  const buyBy = new Map(buys.map((b) => [b.key, b]));
  const keys = [...new Set([...views.map((v) => v.key), ...buys.map((b) => b.key)])];
  const viewBy = new Map(views.map((v) => [v.key, v]));
  return keys
    .map((key) => {
      const v = viewBy.get(key) ?? { total: 0, people: 0 };
      const b = buyBy.get(key) ?? { total: 0, people: 0 };
      const viewers = Math.max(v.people, b.people);
      const pct = viewers ? Math.round((b.people / viewers) * 1000) / 10 : 0;
      const level: Attraction['level'] = viewers < rules.minViewers ? 'few' : pct >= rules.strongPct ? 'strong' : pct >= rules.fairPct ? 'fair' : 'weak';
      return { key, views: v.total, viewers, buys: b.total, buyers: b.people, pct, level };
    })
    .sort((a, b) => b.viewers - a.viewers || b.buyers - a.buyers || a.key.localeCompare(b.key));
}

export const LEVEL_LABEL: Record<Attraction['level'], string> = { strong: 'Strong', fair: 'Fair', weak: 'Weak', few: 'Too few visits' };

/* --- the daily report as a spreadsheet --- */

export type Named<T> = T & { name: string };
export type ReportData = {
  day: string;
  totals: DayLine;
  dayBefore: DayLine;
  activity: Record<string, number>;
  pages: Top[];
  products: Named<Top>[];
  categories: Named<Top>[];
  attraction: Named<Attraction>[];
};
export const DAY_FIELDS: [keyof Omit<DayLine, 'day'>, string][] = [
  ['visitors', 'Visitors'],
  ['fresh', 'New visitors'],
  ['repeat', 'Repeat visitors'],
  ['pages', 'Pages opened'],
  ['products', 'Product opens'],
  ['categories', 'Category opens'],
  ['buys', 'Buy clicks'],
];

/* A cell a spreadsheet will not run as a formula. */
const cell = (v: string | number) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (...v: (string | number)[]) => v.map(cell).join(',');

export function reportCsv(r: ReportData, activityLabels: Record<string, string> = {}): string {
  const out = [line('Daily report', r.day), '', line('Number', r.day, r.dayBefore.day)];
  for (const [k, label] of DAY_FIELDS) out.push(line(label, r.totals[k], r.dayBefore[k]));
  out.push('', line('Site activity', 'Count'));
  for (const [k, n] of Object.entries(r.activity)) out.push(line(activityLabels[k] ?? k, n));
  out.push('', line('Product', 'Opens', 'People'));
  for (const p of r.products) out.push(line(p.name, p.total, p.people));
  out.push('', line('Category', 'Opens', 'People'));
  for (const c of r.categories) out.push(line(c.name, c.total, c.people));
  out.push('', line('Product', 'People who opened it', 'People who clicked Buy', 'Share who clicked Buy (%)', 'Attraction'));
  for (const a of r.attraction) out.push(line(a.name, a.viewers, a.buyers, a.pct, LEVEL_LABEL[a.level]));
  out.push('', line('Page', 'Opens', 'People'));
  for (const p of r.pages) out.push(line(p.key, p.total, p.people));
  return out.join('\r\n') + '\r\n';
}
