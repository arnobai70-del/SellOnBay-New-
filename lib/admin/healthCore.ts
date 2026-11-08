/*
 * Admin › System › Server health (owner, 2026-11-08): the levels. Pure, tested. A share of a limit is normal under 80%, a warning from 80 to 90%
 * and critical over 90%. Figures that are not shares are turned into one the same way (days left, errors, failed emails), so every metric reads
 * normal, warning or critical, or "not measured" when the app cannot know it.
 */
export type Level = 'ok' | 'warn' | 'bad' | 'off';
export type Metric = { key: string; label: string; level: Level; value: string; note?: string };

export const levelOfPct = (pct: number | null): Level => (pct === null || !Number.isFinite(pct) ? 'off' : pct > 90 ? 'bad' : pct >= 80 ? 'warn' : 'ok');
export const pctOf = (used: number | null, limit: number | null) => (used === null || !limit ? null : Math.round((used / limit) * 1000) / 10);
/* Days left on a certificate or a domain: 14 days or fewer is critical, 30 or fewer a warning. */
export const levelOfDays = (days: number | null): Level => (days === null ? 'off' : days <= 14 ? 'bad' : days <= 30 ? 'warn' : 'ok');
/* A count that should be 0: critical at `bad` or more, a warning above 0. */
export const levelOfCount = (n: number | null, bad: number): Level => (n === null ? 'off' : n >= bad ? 'bad' : n > 0 ? 'warn' : 'ok');
/* Hours since something that should happen every `everyH` hours: a warning after 1.5 times that, critical after 3 times. */
export const levelOfAge = (hours: number | null, everyH: number): Level => (hours === null ? 'off' : hours > everyH * 3 ? 'bad' : hours > everyH * 1.5 ? 'warn' : 'ok');

export type HostKind = 'server' | 'shared' | 'serverless';
/* Where the app runs: machine figures are ours only on our own server. Serverless hosts are recognised by their own variables. */
export function hostKind(env: Record<string, string | undefined>): HostKind {
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.NETLIFY || env.K_SERVICE) return 'serverless';
  return env.HOST_KIND === 'server' ? 'server' : env.HOST_KIND === 'serverless' ? 'serverless' : 'shared';
}
export const HOST_NOTE: Record<HostKind, string> = {
  server: '',
  shared: 'The site runs on shared hosting, so the machine’s CPU, memory and disk belong to the host and are not shown. Set HOST_KIND=server on our own server.',
  serverless: 'The site runs serverless: there is no machine of ours to measure, so CPU, memory, disk and uptime are not shown.',
};

/* The metrics that alert: critical ones, by key. */
export const criticals = (metrics: Metric[]) => metrics.filter((m) => m.level === 'bad');
