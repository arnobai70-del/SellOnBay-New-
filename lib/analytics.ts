import { derivedSecret } from './secrets';
import 'server-only';
import { createHash } from 'node:crypto';
import { CONFIG, DAY_MS } from './config';
import {
  type Attraction,
  type DayLine,
  type Event,
  type Hit,
  type Named,
  type ReportData,
  type Row,
  type Top,
  addHit,
  attraction,
  categoryLabel,
  dayOf,
  emptyDay,
  sumDays,
  sumTop,
} from './analyticsCore';
import { productByKey } from './catalog';
import { METRICS, type Metric, series as metricSeries } from './metrics';
import { notifyAdmins } from './notify';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Visitor analytics for the admin (owner, 2026-10-21): visitors a day, how many came back, which products and categories are opened, which
 * products people click Buy on, and a stored daily report. No cookie and no address is kept: a visitor is a keyed hash of the connection address
 * and the browser, so one person on two devices counts twice. Rows live CONFIG.analytics.keepDays days. Days are UTC, like the Risk page.
 * Postgres with migration 0052, in memory otherwise. A failure to count never breaks the page.
 */
const mem = ((globalThis as { __analyticsMem?: { rows: Map<string, Row>; firsts: Map<string, string>; reports: Map<string, Report> } }).__analyticsMem ??= {
  rows: new Map(),
  firsts: new Map(),
  reports: new Map(),
});
const burst = new Map<string, { minute: number; n: number }>();

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('analytics_hits').select('day').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

const salt = () => derivedSecret('ANALYTICS_SALT') ?? derivedSecret('GUARD_SALT') ?? 'sellonbay-dev-salt';
export const visitorOf = (ip: string, ua: string) => createHash('sha256').update(`visit:${salt()}:${ip}|${ua}`).digest('hex').slice(0, 24);

/* Stores what one visitor did. Returns how many hits were kept (0 when over the per-minute limit). */
export async function record(visitor: string, hits: Hit[], now = Date.now()): Promise<number> {
  const minute = Math.floor(now / 60_000);
  const b = burst.get(visitor);
  const used = b && b.minute === minute ? b.n : 0;
  const room = Math.max(0, CONFIG.analytics.perVisitorPerMinute - used);
  const keep = hits.slice(0, room);
  if (!keep.length) return 0;
  if (burst.size > 5000) burst.clear();
  burst.set(visitor, { minute, n: used + keep.length });
  const day = dayOf(now);
  try {
    if (await pg()) {
      const db = createAdminClient();
      for (const h of keep) await db.rpc('analytics_hit', { p_day: day, p_visitor: visitor, p_event: h.event, p_key: h.key });
    } else for (const h of keep) addHit(mem.rows, mem.firsts, day, visitor, h);
  } catch {
    // Counting must never break the page.
  }
  return keep.length;
}

/* The last `days` days, oldest first, today last. */
export async function days(n = 14, now = Date.now()): Promise<DayLine[]> {
  const list = Array.from({ length: n }, (_, i) => emptyDay(dayOf(now - (n - 1 - i) * DAY_MS)));
  const from = list[0].day,
    to = list[n - 1].day;
  let by = new Map<string, DayLine>();
  if (await pg()) {
    const { data } = await createAdminClient().rpc('analytics_days', { p_from: from, p_to: to });
    for (const r of (data ?? []) as { day: string; visitors: number; repeat_visitors: number; pages: number; products: number; categories: number; buys: number }[]) {
      const visitors = Number(r.visitors),
        repeat = Number(r.repeat_visitors);
      by.set(r.day, { day: r.day, visitors, repeat, fresh: visitors - repeat, pages: Number(r.pages), products: Number(r.products), categories: Number(r.categories), buys: Number(r.buys) });
    }
  } else by = sumDays(mem.rows.values(), mem.firsts, from, to);
  return list.map((d) => by.get(d.day) ?? d);
}

export async function top(event: Event, from: string, to: string, limit: number = CONFIG.analytics.topRows): Promise<Top[]> {
  if (await pg()) {
    const { data } = await createAdminClient().rpc('analytics_top', { p_event: event, p_from: from, p_to: to, p_limit: limit });
    return ((data ?? []) as { key: string; total: number; people: number }[]).map((r) => ({ key: r.key, total: Number(r.total), people: Number(r.people) }));
  }
  return sumTop(mem.rows.values(), event, from, to, limit);
}

async function nameOf(id: string): Promise<string> {
  try {
    return (await productByKey(id))?.name ?? id;
  } catch {
    return id;
  }
}

export type Overview = {
  from: string;
  to: string;
  pages: Top[];
  products: Named<Top>[];
  categories: Named<Top>[];
  attraction: Named<Attraction>[];
};

/* The top lists for a range of days. */
export async function overview(from: string, to: string, limit: number = CONFIG.analytics.topRows): Promise<Overview> {
  const [pages, products, categories, views, buys] = await Promise.all([
    top('page', from, to, limit),
    top('product', from, to, limit),
    top('category', from, to, limit),
    top('product', from, to, 200),
    top('buy', from, to, 200),
  ]);
  const drawn = attraction(views, buys).slice(0, limit);
  const names = new Map<string, string>();
  for (const id of new Set([...products.map((p) => p.key), ...drawn.map((a) => a.key)])) names.set(id, await nameOf(id));
  return {
    from,
    to,
    pages,
    products: products.map((p) => ({ ...p, name: names.get(p.key) ?? p.key })),
    categories: categories.map((c) => ({ ...c, name: categoryLabel(c.key) })),
    attraction: drawn.map((a) => ({ ...a, name: names.get(a.key) ?? a.key })),
  };
}

/* --- the daily report --- */

export type Report = ReportData & Overview & { madeAt: number; activity: Record<Metric, number> };

/* Builds the report for one UTC day from what is stored now. */
export async function buildReport(day: string, now = Date.now()): Promise<Report> {
  const end = Date.parse(`${day}T12:00:00Z`);
  const [two, rest, act] = await Promise.all([days(2, end), overview(day, day), metricSeries(1, end)]);
  return { day, madeAt: now, totals: two[1], dayBefore: two[0], activity: act[0]?.values ?? (Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>), ...rest };
}

export async function savedReport(day: string): Promise<Report | null> {
  if (await pg()) {
    const { data } = await createAdminClient().from('analytics_reports').select('report').eq('day', day).maybeSingle();
    return (data?.report as Report | undefined) ?? null;
  }
  return mem.reports.get(day) ?? null;
}

/* Days that have a stored report, newest first. */
export async function reportDays(limit: number = CONFIG.analytics.reportsShown): Promise<string[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('analytics_reports').select('day').order('day', { ascending: false }).limit(limit);
    return (data ?? []).map((r: { day: string }) => r.day);
  }
  return [...mem.reports.keys()].sort().reverse().slice(0, limit);
}

/*
 * Run by the scheduled job: once a day, makes and stores yesterday's report, tells the admins (in the app and by email), and forgets rows older
 * than keepDays. Returns the day reported, or null when it was already done.
 */
export async function dailyReport(now = Date.now()): Promise<string | null> {
  const day = dayOf(now - DAY_MS);
  try {
    if (await savedReport(day)) return null;
    const r = await buildReport(day, now);
    if (await pg()) {
      const db = createAdminClient();
      const { error } = await db.from('analytics_reports').insert({ day, report: r });
      if (error) return null; // another copy of the site made it first
      await db.rpc('analytics_purge', { p_before: dayOf(now - CONFIG.analytics.keepDays * DAY_MS) });
    } else {
      mem.reports.set(day, r);
      const before = dayOf(now - CONFIG.analytics.keepDays * DAY_MS);
      for (const [k, row] of mem.rows) if (row.day < before) mem.rows.delete(k);
    }
    const best = r.products[0];
    await notifyAdmins(
      'daily_report',
      {
        day,
        visitors: r.totals.visitors,
        repeat: r.totals.repeat,
        pages: r.totals.pages,
        top: best ? `${best.name} (${best.total} opens)` : 'none yet',
        orders: r.activity.orders,
      },
      `daily_report:${day}`,
    );
    return day;
  } catch {
    return null;
  }
}
