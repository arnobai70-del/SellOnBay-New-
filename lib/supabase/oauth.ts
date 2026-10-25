import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './env';

export type OAuthProvider = 'google' | 'apple';
const ALL: OAuthProvider[] = ['google', 'apple'];

/* The sign-in providers switched on in Supabase (Authentication > Sign In / Providers), read from its public settings so a
   button never leads to "provider is not enabled". Kept for a minute; when Supabase cannot be reached no button shows. */
export async function enabledOAuth(): Promise<OAuthProvider[]> {
  if (!supabaseConfigured) return [];
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const { external } = (await res.json()) as { external?: Record<string, unknown> };
    return ALL.filter((p) => external?.[p] === true);
  } catch {
    return [];
  }
}
