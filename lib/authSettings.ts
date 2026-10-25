import 'server-only';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './supabase/env';

/*
 * Whether new accounts must confirm their email before they can sign in. This is a setting in the Supabase dashboard
 * (Authentication > Providers > Email > Confirm email), not in our code, so the launch check asks the auth server.
 * The public settings endpoint needs only the anon key. Returns null when it cannot tell (demo mode, network error).
 */
type Fetch = typeof fetch;

export async function emailConfirmationOn(opts: { url?: string; anonKey?: string; fetcher?: Fetch } = {}): Promise<boolean | null> {
  const url = opts.url ?? (supabaseConfigured ? supabaseUrl : '');
  const key = opts.anonKey ?? supabaseAnonKey;
  if (!/^https?:\/\//.test(url) || !key) return null;
  try {
    const res = await (opts.fetcher ?? fetch)(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { mailer_autoconfirm?: unknown };
    return typeof body.mailer_autoconfirm === 'boolean' ? !body.mailer_autoconfirm : null;
  } catch {
    return null;
  }
}
