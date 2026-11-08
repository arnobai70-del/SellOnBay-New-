import 'server-only';
import { serviceAssertion } from './ga4Country';
import { readSections, readVisitors, sectionReport, visitorReports, type Named, type VisitorReport } from './ga4VisitorsCore';

/*
 * Admin › System › Visitors reads GA4 with a service account (owner, 2026-11-08): GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON live only in the server
 * environment and are never sent to a page. Without them the page shows "Connect GA4". Answers are cached 15 minutes per server copy; an error is
 * shown as a note and never breaks the page. The section clicks need a custom dimension "section" (event scope) registered in GA4.
 */
export type GaVisitors = { state: 'not_connected' } | { state: 'error'; note: string } | { state: 'ok'; report: VisitorReport; sections: Named[] | { note: string }; fetchedAt: number };

const TTL = 15 * 60_000;
const g = globalThis as { __gaVisitors?: { at: number; value: GaVisitors }; __gaToken?: { token: string; until: number } };

function account(env: Record<string, string | undefined>) {
  const id = (env.GA4_PROPERTY_ID ?? '').trim();
  if (!/^\d{5,15}$/.test(id) || !env.GA4_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON) as { client_email?: string; private_key?: string };
    return sa.client_email && sa.private_key ? { id, sa: { client_email: sa.client_email, private_key: sa.private_key } } : null;
  } catch {
    return null;
  }
}
export const ga4Configured = (env: Record<string, string | undefined> = process.env) => account(env) !== null;

async function token(sa: { client_email: string; private_key: string }, f: typeof fetch): Promise<string> {
  if (g.__gaToken && g.__gaToken.until > Date.now()) return g.__gaToken.token;
  const r = await f('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAssertion(sa) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`GA4 sign-in failed (${r.status}). Check the service account and its Viewer access.`);
  const { access_token, expires_in } = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!access_token) throw new Error('GA4 sign-in gave no token.');
  g.__gaToken = { token: access_token, until: Date.now() + Math.max(60, (expires_in ?? 3600) - 120) * 1000 };
  return access_token;
}

export async function gaVisitors(env: Record<string, string | undefined> = process.env, f: typeof fetch = fetch, now = Date.now()): Promise<GaVisitors> {
  const acc = account(env);
  if (!acc) return { state: 'not_connected' };
  if (g.__gaVisitors && now - g.__gaVisitors.at < TTL) return g.__gaVisitors.value;
  let value: GaVisitors;
  try {
    const t = await token(acc.sa, f);
    const base = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(acc.id)}`;
    const headers = { authorization: `Bearer ${t}`, 'content-type': 'application/json' };
    const batch = await f(`${base}:batchRunReports`, { method: 'POST', headers, body: JSON.stringify({ requests: visitorReports() }), signal: AbortSignal.timeout(15_000) });
    if (!batch.ok) throw new Error(`GA4 report failed (${batch.status}).`);
    const { reports } = (await batch.json()) as { reports?: unknown[] };
    const report = readVisitors(reports ?? [], new Date(now).toISOString().slice(0, 10));
    const s = await f(`${base}:runReport`, { method: 'POST', headers, body: JSON.stringify(sectionReport()), signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const sections: Named[] | { note: string } = s?.ok ? readSections(await s.json()) : { note: 'Register a custom dimension "section" (event scope) in GA4 to see clicks by section.' };
    value = { state: 'ok', report, sections, fetchedAt: now };
  } catch (e) {
    value = { state: 'error', note: (e as Error).message.slice(0, 200) };
  }
  g.__gaVisitors = { at: value.state === 'error' ? now - TTL + 120_000 : now, value }; // an error is tried again after 2 minutes
  return value;
}
