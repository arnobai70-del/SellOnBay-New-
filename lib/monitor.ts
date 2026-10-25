/*
 * Server error reports, called by instrumentation.ts for every error Next catches (pages, API routes, server actions, the proxy).
 * Always: one JSON line on stderr, which the host's log viewer can search ("event":"request_error").
 * With ERROR_WEBHOOK_URL (https, a secret: Slack, Discord or any monitoring service that takes a JSON POST): the same report is posted
 * there too, at most once a minute per kind of error and 30 a minute in all, so an error storm cannot flood it or slow the site.
 * A report carries no headers, cookies, query string, request body or stack, and email addresses and long numbers or tokens in the message
 * are blanked, so no personal data or key leaves the server.
 */
export type ErrorReport = {
  event: 'request_error';
  at: string;
  message: string;
  digest?: string;
  method: string;
  path: string;
  route: string;
  kind: string;
  copy?: string;
};

type Req = { path: string; method: string };
type Ctx = { routePath?: string; routeType?: string };

export const redact = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\b(?:eyJ|sk_|re_|pk_)[A-Za-z0-9._-]{8,}/g, '[key]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]')
    .replace(/\d{6,}/g, '[number]');

export function errorReport(err: unknown, req: Req, ctx: Ctx, now = Date.now()): ErrorReport {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest).slice(0, 64) : undefined;
  return {
    event: 'request_error',
    at: new Date(now).toISOString(),
    message: redact(raw).slice(0, 300),
    ...(digest ? { digest } : {}),
    method: String(req.method).slice(0, 10),
    path: redact(String(req.path).split('?')[0]).slice(0, 200),
    route: String(ctx.routePath ?? '').slice(0, 200),
    kind: String(ctx.routeType ?? ''),
    ...(process.env.SOB_COPY ? { copy: process.env.SOB_COPY } : {}),
  };
}

const g = globalThis as { __monitor?: { sent: Map<string, number>; minute: number; count: number } };
const state = () => (g.__monitor ??= { sent: new Map(), minute: 0, count: 0 });
const PER_KIND_MS = 60_000;
const PER_MINUTE = 30;

/* Whether this report may go to the webhook now; counts it when it may. */
export function mayPost(r: ErrorReport, now = Date.now()): boolean {
  const s = state();
  const key = `${r.route}|${r.digest ?? r.message}`;
  const last = s.sent.get(key);
  if (last !== undefined && now - last < PER_KIND_MS) return false;
  const minute = Math.floor(now / 60_000);
  if (minute !== s.minute) Object.assign(s, { minute, count: 0 });
  if (s.count >= PER_MINUTE) return false;
  s.count++;
  s.sent.set(key, now);
  if (s.sent.size > 1_000) for (const [k, t] of s.sent) if (now - t >= PER_KIND_MS) s.sent.delete(k);
  return true;
}
export const resetMonitorForTests = () => void (g.__monitor = undefined);

export const webhookConfigured = () => /^https:\/\/[^\s]+$/.test(process.env.ERROR_WEBHOOK_URL ?? '');

export async function reportError(err: unknown, req: Req, ctx: Ctx, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const r = errorReport(err, req, ctx);
    console.error(JSON.stringify(r));
    if (!webhookConfigured() || !mayPost(r)) return;
    const text = `SellOnBay server error on ${r.method} ${r.path}: ${r.message}${r.digest ? ` (digest ${r.digest})` : ''}`;
    await fetcher(process.env.ERROR_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // "text" and "content" make it readable in Slack and Discord as they are; other services read the fields.
      body: JSON.stringify({ text, content: text, ...r }),
      signal: AbortSignal.timeout(2_000),
      cache: 'no-store',
    });
  } catch {
    // Reporting must never cause a second error.
  }
}
