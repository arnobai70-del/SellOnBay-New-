import 'server-only';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { errorSummary } from '../appErrors';
import { recentRuns } from '../cronRuns';
import { emailProvider } from '../providers/email';
import { senderFrom } from '../emailRouting';
import { limit } from '../rateLimit';
import { SITE_URL } from '../site';
import { contactRoutes } from '../site/contentStore';
import { supabaseConfigured } from '../supabase/env';
import { adminClientAvailable, createAdminClient } from '../supabase/server';
import { criticals, HOST_NOTE, hostKind, levelOfAge, levelOfCount, levelOfDays, levelOfPct, pctOf, type HostKind, type Metric } from './healthCore';
import { systemSnapshot } from './system';
import { samples } from '../timing';
import { p95 } from '../timingCore';

/* The API p95 against a 1-second target, with the same 80% and 90% levels. */
const apiLevel = (ms: number | null) => (ms === null ? ('off' as const) : levelOfPct((ms / 1000) * 100));

/*
 * Admin › System › Server health (owner, 2026-11-08), on top of the read-only system snapshot (lib/admin/system.ts). Read only: nothing here changes
 * anything, returns a key or a value from the environment, or names a person. Plan limits come from DB_PLAN_MB and STORAGE_PLAN_MB (defaults: the
 * Supabase free plan, 500 MB and 1 GB). A critical metric emails dev@ at most once an hour per metric.
 */
export type Health = { at: number; host: HostKind; hostNote: string; machine: Metric[]; metrics: Metric[] };

const LIMIT_MS = 2_500;
async function within<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<T>((r) => (timer = setTimeout(() => r(fallback), LIMIT_MS)))]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
const db = () => supabaseConfigured && adminClientAvailable();
const mb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} GB` : `${Math.round(n)} MB`);
const planMb = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

async function machine(kind: HostKind): Promise<Metric[]> {
  if (kind !== 'server') return [];
  const cpu = Math.round((os.loadavg()[0] / Math.max(1, os.cpus().length)) * 1000) / 10;
  const ram = pctOf(os.totalmem() - os.freemem(), os.totalmem());
  const disk = await within(async () => {
    const s = await statfs('/');
    return pctOf((s.blocks - s.bavail) * s.bsize, s.blocks * s.bsize);
  }, null);
  const up = Math.round(os.uptime() / 3600);
  return [
    { key: 'cpu', label: 'CPU (1-minute load)', level: levelOfPct(cpu), value: `${cpu}%` },
    { key: 'ram', label: 'Memory', level: levelOfPct(ram), value: ram === null ? 'Not known' : `${ram}%` },
    { key: 'disk', label: 'Disk', level: levelOfPct(disk), value: disk === null ? 'Not known' : `${disk}%` },
    { key: 'uptime', label: 'Uptime', level: 'ok', value: up >= 48 ? `${Math.round(up / 24)} days` : `${up} hours` },
  ];
}

const storageMb = () =>
  within(async () => {
    if (!db()) return null;
    const { data, error } = await createAdminClient().rpc('system_storage_bytes'); // migration 0080
    return error ? null : Number(data) / 1048576;
  }, null);

const outbox = () =>
  within(async () => {
    if (!db()) return null;
    const sb = createAdminClient();
    const day = new Date(Date.now() - 86_400_000).toISOString();
    const [w, f] = await Promise.all([
      sb.from('email_outbox').select('id', { count: 'exact', head: true }).in('status', ['pending', 'sending']),
      sb.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', day),
    ]);
    return w.error || f.error ? null : { waiting: w.count ?? 0, failed: f.count ?? 0 };
  }, null);

/* The newest Supabase backup, through the Management API, only with a server-only SUPABASE_ACCESS_TOKEN. */
const lastBackup = () =>
  within(async () => {
    const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
    const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')?.[1];
    if (!token || !ref) return 'not connected' as const;
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/backups`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(LIMIT_MS), cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { backups?: { inserted_at?: string; status?: string }[] };
    const at = (j.backups ?? []).map((b) => Date.parse(b.inserted_at ?? '')).filter(Number.isFinite);
    return at.length ? Math.max(...at) : null;
  }, null);

/* Days until the domain runs out, from public RDAP (no key), kept 12 hours. */
const g = globalThis as { __domainDays?: { at: number; days: number | null } };
const domainDays = () =>
  within(async () => {
    if (g.__domainDays && Date.now() - g.__domainDays.at < 12 * 3_600_000) return g.__domainDays.days;
    const host = new URL(SITE_URL).hostname.replace(/^www\./, '');
    if (!/\.[a-z]{2,}$/.test(host) || host === 'localhost') return null;
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`, { signal: AbortSignal.timeout(LIMIT_MS), cache: 'no-store' });
    const j = r.ok ? ((await r.json()) as { events?: { eventAction?: string; eventDate?: string }[] }) : null;
    const exp = j?.events?.find((e) => e.eventAction === 'expiration')?.eventDate;
    const days = exp ? Math.floor((Date.parse(exp) - Date.now()) / 86_400_000) : null;
    g.__domainDays = { at: Date.now(), days };
    return days;
  }, null);

/* Kept one minute per server copy, so reloading the page or the scheduled job does not repeat every check (each can take seconds on a slow link). */
const cache = globalThis as { __health?: Health };
export async function serverHealth(now = Date.now()): Promise<Health> {
  if (cache.__health && now - cache.__health.at < 60_000) return cache.__health;
  cache.__health = await measure(now);
  return cache.__health;
}

async function measure(now: number): Promise<Health> {
  const kind = hostKind(process.env);
  const [snap, store, mail, backup, domain, errors, runs, mach] = await Promise.all([
    systemSnapshot(now),
    storageMb(),
    outbox(),
    lastBackup(),
    domainDays(),
    within(() => errorSummary(now), null),
    within(recentRuns, null),
    machine(kind),
  ]);
  const api = p95(samples(), now);
  const dbLimit = planMb('DB_PLAN_MB', 500);
  const stLimit = planMb('STORAGE_PLAN_MB', 1024);
  const dbPct = pctOf(snap.database.sizeMb, dbLimit);
  const stPct = pctOf(store, stLimit);
  const lastRun = runs?.find((r) => r.ok) ?? null;
  const runAgeH = lastRun ? (now - (lastRun.finishedAt ?? lastRun.startedAt)) / 3_600_000 : null;
  const backupAgeH = typeof backup === 'number' ? (now - backup) / 3_600_000 : null;
  const day = errors?.counts.lastDay ?? null;
  const metrics: Metric[] = [
    { key: 'db_size', label: 'Database size', level: levelOfPct(dbPct), value: snap.database.sizeMb === null ? 'Not known' : `${mb(snap.database.sizeMb)} of ${mb(dbLimit)} (${dbPct}%)` },
    { key: 'storage_size', label: 'File storage', level: levelOfPct(stPct), value: store === null ? 'Not known' : `${mb(store)} of ${mb(stLimit)} (${stPct}%)` },
    {
      key: 'api_p95',
      label: 'API p95 (last hour)',
      level: apiLevel(api.p95),
      value: api.p95 === null ? `Not enough requests yet (${api.count})` : `${api.p95} ms over ${api.count} requests`,
      note: 'Timed on this server copy, sampled. Normal under 800 ms, a warning from 800 ms, critical over 900 ms (80% and 90% of a 1-second target).',
    },
    { key: 'errors', label: 'Errors in 24 hours', level: levelOfCount(day, 100), value: day === null ? 'Not known' : String(day) },
    {
      key: 'email',
      label: 'Email queue',
      level: mail === null ? 'off' : mail.failed >= 10 ? 'bad' : mail.failed > 0 || mail.waiting >= 50 ? 'warn' : 'ok',
      value: mail === null ? 'Not known' : `${mail.waiting} waiting, ${mail.failed} failed in 24 hours`,
    },
    {
      key: 'backup',
      label: 'Last backup',
      level: levelOfAge(backupAgeH, 24),
      value: backup === 'not connected' ? 'Not connected' : backup === null ? 'Not known' : `${Math.round(backupAgeH!)} hours ago`,
      note: backup === 'not connected' ? 'Needs SUPABASE_ACCESS_TOKEN on the server to read Supabase backups.' : undefined,
    },
    { key: 'ssl', label: 'SSL certificate', level: levelOfDays(snap.safety.sslDays), value: snap.safety.sslDays === null ? 'Not known' : `${snap.safety.sslDays} days left` },
    { key: 'domain', label: 'Domain', level: levelOfDays(domain), value: domain === null ? 'Not known' : `${domain} days left` },
    {
      key: 'jobs',
      label: 'Last job run',
      level: levelOfAge(runAgeH, 1),
      value: lastRun ? `${lastRun.job}, ${Math.max(0, Math.round((runAgeH ?? 0) * 60))} minutes ago` : 'None recorded',
    },
  ];
  return { at: now, host: kind, hostNote: HOST_NOTE[kind], machine: mach, metrics };
}

/* Critical metrics email dev@ at most once an hour each (the key's limit is 1 an hour). Called by the page and by the scheduled job. */
export async function alertCriticals(h: Health): Promise<number> {
  let sent = 0;
  for (const m of criticals([...h.machine, ...h.metrics])) {
    if (!(await limit(`health-alert:${m.key}`, 1, 3_600_000))) continue;
    try {
      const routes = await contactRoutes();
      await emailProvider().send({
        to: routes.dev,
        from: senderFrom(routes.dev),
        subject: `[SellOnBay] Critical: ${m.label}`,
        text: `${m.label} is critical: ${m.value}.\n\nSee Admin › System › Server health: ${SITE_URL}/admin/system`,
        idempotencyKey: `health/${m.key}/${Math.floor(h.at / 3_600_000)}`,
      });
      sent++;
    } catch {
      // the next hour tries again
    }
  }
  return sent;
}
