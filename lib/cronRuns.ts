import 'server-only';
import type { Job } from './heartbeat';
import { supabaseConfigured } from './supabase/env';
import { adminClientAvailable, createAdminClient } from './supabase/server';

/*
 * Each run of a scheduled job (migration 0071), for the admin "Server and system" page: a row when it starts, finished with ok or the
 * first 500 characters of the error. Writing here never fails the job: without the table (migration not applied) or the database it
 * does nothing. The heartbeat (lib/heartbeat.ts) still keeps the last good run for the launch check.
 */
export type CronRun = { id: number; job: Job; startedAt: number; finishedAt: number | null; ok: boolean | null; error: string | null };
const KEEP_DAYS = 30;
const on = () => supabaseConfigured && adminClientAvailable();

export async function startRun(job: Job): Promise<number | null> {
  if (!on()) return null;
  try {
    const { data, error } = await createAdminClient().from('cron_runs').insert({ job }).select('id').single();
    return error ? null : (data as { id: number }).id;
  } catch {
    return null;
  }
}

export async function finishRun(id: number | null, ok: boolean, error?: unknown): Promise<void> {
  if (id === null || !on()) return;
  const text = error === undefined ? null : (error instanceof Error ? error.message : String(error)).slice(0, 500);
  try {
    await createAdminClient().from('cron_runs').update({ finished_at: new Date().toISOString(), ok, error: text }).eq('id', id);
  } catch {
    /* the run itself already happened */
  }
}

/* Runs a job between startRun and finishRun; a failure is recorded and thrown on, so the route answers as it did before. */
export async function recordRun<T>(job: Job, run: () => Promise<T>): Promise<T> {
  const id = await startRun(job);
  try {
    const out = await run();
    await finishRun(id, true);
    return out;
  } catch (e) {
    await finishRun(id, false, e);
    throw e;
  }
}

/* Deletes runs and error counts older than 30 days (called by the orders job). Returns how many runs were removed. */
export async function purgeSystemRecords(now = Date.now()): Promise<number> {
  if (!on()) return 0;
  const before = new Date(now - KEEP_DAYS * 86_400_000).toISOString();
  try {
    const db = createAdminClient();
    const { count } = await db.from('cron_runs').delete({ count: 'exact' }).lt('started_at', before);
    await db.from('app_errors').delete().lt('hour', before);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function recentRuns(limit = 20): Promise<CronRun[] | null> {
  if (!on()) return [];
  const { data, error } = await createAdminClient().from('cron_runs').select('id, job, started_at, finished_at, ok, error').order('started_at', { ascending: false }).limit(limit);
  if (error) return null; // the table is not there yet (migration 0071)
  return (data ?? []).map((r) => ({
    id: r.id,
    job: r.job as Job,
    startedAt: Date.parse(r.started_at),
    finishedAt: r.finished_at ? Date.parse(r.finished_at) : null,
    ok: r.ok,
    error: r.error,
  }));
}
