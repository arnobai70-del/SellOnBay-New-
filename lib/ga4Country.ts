import 'server-only';
import { createSign } from 'node:crypto';
import { isFlagOn } from './featureFlags';
import { ga4ReportBody, parseGa4Report, type Ga4CountryRow } from './countryCore';

/*
 * GA4 country reports through the GA4 Data API (Blueprint 8.1, option 1). The property behind G-FEK9C0CM04 is read with a service account
 * that has Viewer access; its key and the numeric property id live only in the server environment (GA4_PROPERTY_ID,
 * GA4_SERVICE_ACCOUNT_JSON). Blocker B-5: not granted yet, so this has NEVER been run against Google. It stays behind the locked flag
 * "analytics.ga4_country" and returns "not connected" until the owner grants access and a staging check passes. Results are cached one hour.
 */
export type Ga4Status = { state: 'off' | 'not_connected' | 'error'; note: string } | { state: 'ok'; rows: Ga4CountryRow[]; fetchedAt: number };

export interface Ga4CountryReader {
  countries(from: string, to: string): Promise<Ga4CountryRow[]>;
}

type Fetch = typeof fetch;
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/* A signed service-account assertion (RS256) for Google's token endpoint, read-only analytics scope. */
export function serviceAssertion(sa: { client_email: string; private_key: string }, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key);
  return `${head}.${body}.${b64url(sig)}`;
}

export function dataApiReader(propertyId: string, sa: { client_email: string; private_key: string }, f: Fetch = fetch): Ga4CountryReader {
  return {
    async countries(from, to) {
      const tok = await f('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAssertion(sa) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!tok.ok) throw new Error(`GA4 sign-in failed (${tok.status}).`);
      const { access_token } = (await tok.json()) as { access_token?: string };
      if (!access_token) throw new Error('GA4 sign-in gave no token.');
      const r = await f(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify(ga4ReportBody(from, to)),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`GA4 report failed (${r.status}).`);
      return parseGa4Report(await r.json());
    },
  };
}

/* The configured reader, or null when the server has no GA4 access configured. */
export function configuredReader(env: Record<string, string | undefined> = process.env, f: Fetch = fetch): Ga4CountryReader | null {
  const id = (env.GA4_PROPERTY_ID ?? '').trim();
  if (!/^\d{5,15}$/.test(id) || !env.GA4_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON) as { client_email?: string; private_key?: string };
    if (!sa.client_email || !sa.private_key) return null;
    return dataApiReader(id, { client_email: sa.client_email, private_key: sa.private_key }, f);
  } catch {
    return null;
  }
}

const g = globalThis as { __ga4Cache?: Map<string, { at: number; rows: Ga4CountryRow[] }> };
const cache = (g.__ga4Cache ??= new Map());

export async function ga4Countries(from: string, to: string, reader: Ga4CountryReader | null = configuredReader(), now = Date.now()): Promise<Ga4Status> {
  if (!(await isFlagOn('analytics.ga4_country'))) return { state: 'off', note: 'Switched off. It waits for GA4 Data API access (blocker B-5).' };
  if (!reader) return { state: 'not_connected', note: 'GA4 access is not configured on the server (GA4_PROPERTY_ID and a service account).' };
  const key = `${from}:${to}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < 3_600_000) return { state: 'ok', rows: hit.rows, fetchedAt: hit.at };
  try {
    const rows = await reader.countries(from, to);
    cache.set(key, { at: now, rows });
    return { state: 'ok', rows, fetchedAt: now };
  } catch (e) {
    return { state: 'error', note: (e as Error).message.slice(0, 200) };
  }
}
