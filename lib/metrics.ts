import 'server-only';
import { CONFIG, DAY_MS } from './config';
import { notifyAdmins } from './notify';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Daily counters for the things an attack shows up in: new accounts, orders, disputes, refunds, abuse reports and failed payments. Each is bumped where
 * it happens (a failure to count never breaks the real action). The admin sees the last two weeks, and a day that is far above the days before it
 * raises an alert (checkAnomalies, run by the daily job).
 */
export type Metric = keyof typeof CONFIG.risk.anomaly.minToday;
export const METRICS = Object.keys(CONFIG.risk.anomaly.minToday) as Metric[];
export const METRIC_LABEL: Record<Metric, string> = {
  accounts: 'New accounts',
  orders: 'Orders',
  disputes: 'Disputes',
  refunds: 'Refunds',
  reports: 'Abuse reports',
  failed_payments: 'Failed payments',
};
export type Day = { day: string; values: Record<Metric, number> };

const mem: Map<string, number> = ((globalThis as { __metricsMem?: Map<string, number> }).__metricsMem ??= new Map());
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const empty = () => Object.fromEntries(METRICS.map((m) => [m, 0])) as Record<Metric, number>;

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('daily_counters').select('day').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

export async function bump(key: Metric, n = 1, now = Date.now()): Promise<void> {
  try {
    if (await pg()) await createAdminClient().rpc('bump_counter', { p_day: dayOf(now), p_key: key, p_n: n });
    else mem.set(`${dayOf(now)}|${key}`, (mem.get(`${dayOf(now)}|${key}`) ?? 0) + n);
  } catch {
    // Counting must never break the thing being counted.
  }
}

/* The last `days` days, oldest first, today last. */
export async function series(days = 14, now = Date.now()): Promise<Day[]> {
  const list: Day[] = Array.from({ length: days }, (_, i) => ({ day: dayOf(now - (days - 1 - i) * DAY_MS), values: empty() }));
  const byDay = new Map(list.map((d) => [d.day, d]));
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('daily_counters')
      .select('day, key, n')
      .gte('day', list[0].day)
      .lte('day', list[days - 1].day);
    for (const r of data ?? []) {
      const d = byDay.get(r.day);
      if (d && (METRICS as string[]).includes(r.key)) d.values[r.key as Metric] = r.n;
    }
  } else {
    for (const [k, n] of mem) {
      const [day, key] = k.split('|');
      const d = byDay.get(day);
      if (d && (METRICS as string[]).includes(key)) d.values[key as Metric] = n;
    }
  }
  return list;
}

/* Unusual: at least `minToday`, and at least `factor` times the average of the days before (an average under 1 counts as 1). */
export function isAnomaly(today: number, before: number[], minToday: number, factor = CONFIG.risk.anomaly.factor): boolean {
  const avg = before.length ? before.reduce((s, n) => s + n, 0) / before.length : 0;
  return today >= minToday && today >= factor * Math.max(avg, 1);
}

export type Anomaly = { metric: Metric; today: number; average: number };
export function findAnomalies(days: Day[]): Anomaly[] {
  const today = days[days.length - 1];
  const before = days.slice(-1 - CONFIG.risk.anomaly.baselineDays, -1);
  return METRICS.flatMap((m) => {
    const prior = before.map((d) => d.values[m]);
    return isAnomaly(today.values[m], prior, CONFIG.risk.anomaly.minToday[m])
      ? [{ metric: m, today: today.values[m], average: Math.round((prior.reduce((s, n) => s + n, 0) / Math.max(prior.length, 1)) * 10) / 10 }]
      : [];
  });
}

/* Tells the admins about every unusual rise, once a day per metric. Returns what it found. */
export async function checkAnomalies(now = Date.now()): Promise<Anomaly[]> {
  const found = findAnomalies(await series(CONFIG.risk.anomaly.baselineDays + 1, now));
  for (const a of found)
    await notifyAdmins(
      'abuse_alert',
      { what: `${METRIC_LABEL[a.metric]} are far above normal`, detail: `${a.today} today against about ${a.average} a day before. Look at Risk in the admin dashboard.` },
      `metric:${a.metric}:${dayOf(now)}`,
    );
  return found;
}
