import 'server-only';
import tls from 'node:tls';
import { errorSummary, type ErrorCounts, type ErrorKind } from '../appErrors';
import { recentRuns, type CronRun } from '../cronRuns';
import { isStale, lastBeat, type Job } from '../heartbeat';
import { launchChecks } from '../launchCheck';
import { moduleStates } from '../maintenance/service';
import { redisPing } from '../rateLimit';
import { SITE_URL } from '../site';
import { supabaseConfigured } from '../supabase/env';
import { adminClientAvailable, createAdminClient } from '../supabase/server';

/*
 * What the admin "Server and system" page shows (read only, Super Admin with the authenticator code). Every check runs on its own with a
 * 2-second limit, so one that hangs or fails shows as "not answering" and never takes the page down. Nothing here returns a key, a value
 * from the environment, an e-mail address or a visitor's address: keys are reported as set or missing only.
 * The site runs on Hostinger's Node.js hosting, so there is no machine or deploy slot of our own to report: only this app's own process.
 */
export type Tone = 'ok' | 'warn' | 'bad' | 'off';
export type Service = { key: string; label: string; tone: Tone; text: string };
export type SystemSnapshot = {
  at: number;
  overall: Tone;
  services: Service[];
  app: { rssMb: number; heapMb: number; uptimeS: number; node: string };
  build: { commit: string | null; builtAt: string | null };
  database: {
    latencyMs: number | null;
    sizeMb: number | null;
    connections: number | null;
    maxConnections: number | null;
    advisors: { security: number; performance: number } | 'not connected' | null;
  };
  jobs: { job: Job; lastGoodAt: number | null; stale: boolean }[];
  runs: CronRun[] | null; // null: migration 0071 not applied
  errors: { counts: ErrorCounts; kinds: ErrorKind[] } | null; // null: migration 0072 not applied
  safety: { sslDays: number | null; keysSet: number; keysTotal: number; missingKeys: string[]; closedModules: string[] };
};

const LIMIT_MS = 2_000;
async function within<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), LIMIT_MS)))]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
const ms = async <T>(work: () => Promise<T>): Promise<{ v: T; ms: number }> => {
  const t0 = Date.now();
  const v = await work();
  return { v, ms: Date.now() - t0 };
};
const db = () => supabaseConfigured && adminClientAvailable();

/* This app's own process (shared hosting: the host's load and memory are not ours to report). */
export function appProcess(): SystemSnapshot['app'] {
  const m = process.memoryUsage();
  return { rssMb: Math.round(m.rss / 1048576), heapMb: Math.round(m.heapUsed / 1048576), uptimeS: Math.round(process.uptime()), node: process.version };
}

/* The commit and time this build was made (next.config.ts); not recorded when the build could not tell. */
export const buildInfo = (): SystemSnapshot['build'] => ({
  commit: /^[0-9a-f]{40}$/.test(process.env.SOB_BUILD_SHA ?? '') ? process.env.SOB_BUILD_SHA! : null,
  builtAt: process.env.SOB_BUILD_TIME || null,
});

async function database(): Promise<SystemSnapshot['database']> {
  if (!db()) return { latencyMs: null, sizeMb: null, connections: null, maxConnections: null, advisors: null };
  const sb = createAdminClient();
  const ping = await within(async () => {
    const r = await ms(() => Promise.resolve(sb.from('app_settings').select('key').limit(1)));
    return r.v.error ? null : r.ms;
  }, null);
  const stats = await within(async () => {
    const { data, error } = await sb.rpc('system_db_stats'); // migration 0073
    const row = (Array.isArray(data) ? data[0] : data) as { db_bytes: number; connections: number; max_connections: number } | null;
    return error || !row ? null : row;
  }, null);
  return {
    latencyMs: ping,
    sizeMb: stats ? Math.round(Number(stats.db_bytes) / 1048576) : null,
    connections: stats?.connections ?? null,
    maxConnections: stats?.max_connections ?? null,
    advisors: await within(advisors, null),
  };
}

/* Security and performance advisor counts from the Supabase Management API, only with a server-only SUPABASE_ACCESS_TOKEN. */
async function advisors(): Promise<{ security: number; performance: number } | 'not connected' | null> {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1];
  if (!token || !ref) return 'not connected';
  const count = async (kind: 'security' | 'performance') => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/${kind}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(LIMIT_MS), cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { lints?: { level?: string }[] };
    return (j.lints ?? []).filter((l) => l.level === 'ERROR' || l.level === 'WARN').length;
  };
  const [security, performance] = await Promise.all([count('security'), count('performance')]);
  return { security, performance };
}

/* Resend answers at all (no key is sent: any HTTP answer means it can be reached). */
const emailReachable = () =>
  within(async () => {
    const r = await fetch('https://api.resend.com/', { method: 'GET', signal: AbortSignal.timeout(LIMIT_MS), cache: 'no-store' });
    return r.status > 0;
  }, false);

/* When the last verified payment webhook arrived (webhook_events, written only after the signature checked out). */
const lastWebhook = () =>
  within(async () => {
    if (!db()) return null;
    const { data, error } = await createAdminClient().from('webhook_events').select('received_at').order('received_at', { ascending: false }).limit(1).maybeSingle();
    return error || !data ? null : Date.parse(data.received_at);
  }, null);

/* Days left on the site's certificate, kept for 6 hours. */
const sslCache = globalThis as { __sslDays?: { days: number | null; at: number } };
function sslDays(): Promise<number | null> {
  const c = sslCache.__sslDays;
  if (c && Date.now() - c.at < 6 * 3_600_000) return Promise.resolve(c.days);
  let host = '';
  try {
    host = new URL(SITE_URL).hostname;
  } catch {
    return Promise.resolve(null);
  }
  if (!host || host === 'localhost' || !SITE_URL.startsWith('https://')) return Promise.resolve(null);
  return within(
    () =>
      new Promise<number | null>((resolve) => {
        const s = tls.connect({ host, port: 443, servername: host, timeout: LIMIT_MS }, () => {
          const to = s.getPeerCertificate()?.valid_to;
          s.end();
          const days = to ? Math.floor((Date.parse(to) - Date.now()) / 86_400_000) : null;
          sslCache.__sslDays = { days, at: Date.now() };
          resolve(days);
        });
        s.on('error', () => resolve(null));
        s.on('timeout', () => (s.destroy(), resolve(null)));
      }),
    null,
  );
}

/* The status of one figure against its limits. Pure, so it is tested. */
export const toneOf = (value: number | null, warnAt: number, badAt: number): Tone => (value === null ? 'off' : value >= badAt ? 'bad' : value >= warnAt ? 'warn' : 'ok');
/* The page's overall chip: the worst service, where "off" (not set up) does not count against it. */
export const overallOf = (services: Pick<Service, 'tone'>[]): Tone => (services.some((s) => s.tone === 'bad') ? 'bad' : services.some((s) => s.tone === 'warn') ? 'warn' : 'ok');

export async function systemSnapshot(now = Date.now()): Promise<SystemSnapshot> {
  const [dbInfo, redis, email, webhookAt, checks, modules, runs, errors, ssl, orders, payouts] = await Promise.all([
    database(),
    within(redisPing, null),
    emailReachable(),
    lastWebhook(),
    within(launchChecks, []),
    within(moduleStates, { modules: [], source: 'memory' as const }),
    within(recentRuns, null),
    within(() => errorSummary(now), null),
    sslDays(),
    within(() => lastBeat('orders'), null),
    within(() => lastBeat('payouts'), null),
  ]);
  const jobs: SystemSnapshot['jobs'] = [
    { job: 'orders', lastGoodAt: orders, stale: isStale('orders', orders, now) },
    { job: 'payouts', lastGoodAt: payouts, stale: isStale('payouts', payouts, now) },
  ];
  // The launch check's list (lib/launchCheck.ts): only the name of each setting and whether it is in place, never a value.
  const missingKeys = checks.filter((c) => c.state !== 'ok').map((c) => c.name);
  const resendSet = Boolean(process.env.RESEND_API_KEY);
  const paypalSet = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  const errorsLastHour = errors?.counts.lastHour ?? 0;
  const services: Service[] = [
    {
      key: 'web',
      label: 'Website',
      tone: errorsLastHour >= 20 ? 'bad' : errorsLastHour > 0 ? 'warn' : 'ok',
      text: errorsLastHour ? `${errorsLastHour} errors in the last hour` : 'Answering, no errors in the last hour',
    },
    !db()
      ? { key: 'db', label: 'Database', tone: 'off', text: 'Not set up' }
      : dbInfo.latencyMs === null
        ? { key: 'db', label: 'Database', tone: 'bad', text: 'Not answering' }
        : { key: 'db', label: 'Database', tone: toneOf(dbInfo.latencyMs, 400, 1500), text: `Answers in ${dbInfo.latencyMs} ms` },
    redis === 'off'
      ? { key: 'cache', label: 'Cache', tone: 'off', text: 'Not set up (limits count per copy)' }
      : redis === null
        ? { key: 'cache', label: 'Cache', tone: 'bad', text: 'Not answering' }
        : { key: 'cache', label: 'Cache', tone: toneOf(redis, 300, 1200), text: `PING in ${redis} ms` },
    !resendSet
      ? { key: 'email', label: 'Email', tone: 'off', text: 'Key not set' }
      : { key: 'email', label: 'Email', tone: email ? 'ok' : 'bad', text: email ? 'Key set, Resend reachable' : 'Key set, Resend not reachable' },
    !paypalSet
      ? { key: 'pay', label: 'Payments', tone: 'off', text: 'PayPal keys not set (test gateway)' }
      : { key: 'pay', label: 'Payments', tone: 'ok', text: webhookAt ? `Last verified webhook ${new Date(webhookAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'Keys set, no webhook yet' },
    {
      key: 'jobs',
      label: 'Scheduled jobs',
      tone: jobs.some((j) => j.stale) ? 'bad' : jobs.every((j) => j.lastGoodAt === null) ? 'off' : 'ok',
      text: jobs.some((j) => j.stale) ? 'A job stopped running' : jobs.every((j) => j.lastGoodAt === null) ? 'Not run yet' : 'Running on time',
    },
    { key: 'backups', label: 'Backups', tone: 'off', text: 'Not recorded. Run npm run db:backup' },
  ];
  return {
    at: now,
    overall: overallOf(services),
    services,
    app: appProcess(),
    build: buildInfo(),
    database: dbInfo,
    jobs,
    runs,
    errors,
    safety: { sslDays: ssl, keysSet: checks.length - missingKeys.length, keysTotal: checks.length, missingKeys, closedModules: modules.modules.filter((m) => m.active).map((m) => m.key) },
  };
}

/* A light reading for the admin overview's chip: the database answering, errors in the last hour and the scheduled jobs. */
export async function quickStatus(now = Date.now()): Promise<Tone> {
  const [ping, errors, orders] = await Promise.all([
    db()
      ? within(async () => {
          const { error } = await createAdminClient().from('app_settings').select('key').limit(1);
          return !error;
        }, false)
      : Promise.resolve(true),
    within(() => errorSummary(now), null),
    within(() => lastBeat('orders'), null),
  ]);
  const lastHour = errors?.counts.lastHour ?? 0;
  if (!ping || isStale('orders', orders, now) || lastHour >= 20) return 'bad';
  return lastHour > 0 ? 'warn' : 'ok';
}
