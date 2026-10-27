import type { FlagKey } from '../featureFlagRegistry';

/*
 * Social sign-in rules (SellOnBay 2.0, Blueprint 6, Addendum section 3, O-6, O-7, placeholder P19). Pure, tested.
 *
 * What this code can do, and what it cannot: the Addendum (3.1) is clear that a check in our callback is NOT enough, because Supabase Auth may
 * link an identity to an existing account before our code runs, and tokens can be obtained without our callback. So every provider stays OFF
 * (its flag is locked, blocker B-7) until automatic linking is confirmed off at the Supabase Auth level and tests S1 to S15 pass on staging.
 * The rules here are the extra layers that hold whatever Supabase does: no admin session through a social identity (O-7), no sign-in through
 * a switched-off provider, no new account through Apple, links only through a fresh, single-use intent, never unlinking the last method.
 */
export const PROVIDERS = {
  google: { label: 'Google', flag: 'login.google' },
  azure: { label: 'Microsoft', flag: 'login.microsoft' }, // personal and work accounts (O-6)
  github: { label: 'GitHub', flag: 'login.github' },
  gitlab: { label: 'GitLab', flag: 'login.gitlab' }, // gitlab.com
  apple: { label: 'Apple', flag: 'login.apple_existing' }, // hidden from new sign-ups; kept for existing Apple accounts (Addendum 3.5)
} as const satisfies Record<string, { label: string; flag: FlagKey }>;
export type SocialProvider = keyof typeof PROVIDERS;
export const isSocialProvider = (p: unknown): p is SocialProvider => typeof p === 'string' && Object.hasOwn(PROVIDERS, p);

export type Identity = { provider: string; created_at?: string; last_sign_in_at?: string };
export const LINK_INTENT_MINUTES = 10;
export const FRESH_AUTH_MINUTES = 10;
export const NEUTRAL_REFUSAL = 'That sign-in did not work. Sign in with your usual method, then link other sign-ins from your account settings.';

/* Any sign-in method other than email and password. */
export const socialIdentities = (ids: Identity[] | null | undefined) => (ids ?? []).filter((i) => i.provider !== 'email');
export const hasSocialIdentity = (ids: Identity[] | null | undefined) => socialIdentities(ids).length > 0;

/* The provider this session was just made with: the identity with the latest sign-in. */
export function latestProvider(ids: Identity[] | null | undefined): string | null {
  const sorted = [...(ids ?? [])].sort((a, b) => Date.parse(b.last_sign_in_at ?? '') - Date.parse(a.last_sign_in_at ?? '') || 0);
  return sorted[0]?.provider ?? null;
}

/*
 * May this sign-in go on? Email always may (TOTP is still required for sellers and admins elsewhere). A social sign-in needs its provider
 * switched on; an admin account never signs in socially (O-7); Apple only signs in accounts that already existed (it is hidden from new users).
 */
export function signInDecision(i: {
  provider: string | null;
  role: string;
  providerOn: boolean;
  newAccount: boolean;
}): { ok: true } | { ok: false; reason: 'admin_social' | 'provider_off' | 'apple_new' } {
  if (!i.provider || i.provider === 'email') return { ok: true };
  if (i.role === 'admin') return { ok: false, reason: 'admin_social' };
  if (!isSocialProvider(i.provider) || !i.providerOn) return { ok: false, reason: 'provider_off' };
  if (i.provider === 'apple' && i.newAccount) return { ok: false, reason: 'apple_new' };
  return { ok: true };
}

export type Intent = { id: string; userId: string; provider: SocialProvider; createdAt: number; expiresAt: number; usedAt: number | null };
export function intentProblem(it: Intent | null, want: { userId: string; provider: string; now: number }): string | null {
  if (!it) return 'missing';
  if (it.userId !== want.userId) return 'other_user';
  if (it.provider !== want.provider) return 'other_provider';
  if (it.usedAt) return 'used';
  if (want.now > it.expiresAt) return 'expired';
  return null;
}

/*
 * Linking needs a fresh re-authentication: some sign-in method used in the last few minutes, and for sellers the authenticator code too.
 * Admin accounts can never link a social sign-in (O-7).
 */
export function linkProblem(i: { role: string; provider: string; providerOn: boolean; amr: { method: string; timestamp: number }[]; now: number }): string | null {
  if (i.role === 'admin') return 'Admin accounts sign in with password and authenticator code only.';
  if (!isSocialProvider(i.provider)) return 'Unknown sign-in method.';
  if (i.provider === 'apple') return 'Apple can no longer be added. Choose another sign-in method.';
  if (!i.providerOn) return 'This sign-in method is not available yet.';
  const fresh = (m: { timestamp: number }) => i.now / 1000 - m.timestamp <= FRESH_AUTH_MINUTES * 60;
  if (!i.amr.some(fresh)) return 'For your safety, sign in again first, then link it within 10 minutes.';
  if (i.role === 'seller' && !i.amr.some((m) => m.method === 'totp' && fresh(m))) return 'Enter your authenticator code again first, then link it within 10 minutes.';
  return null;
}

/* An account always keeps at least one way to sign in. */
export function unlinkProblem(ids: Identity[], provider: string): string | null {
  if (!ids.some((i) => i.provider === provider)) return 'That sign-in is not linked.';
  if (ids.length <= 1) return 'This is your only way to sign in. Add another one first.';
  return null;
}

/*
 * Social identities on an account that are neither its first identity (how the account was made) nor recorded as linked through an intent.
 * Finding one means an identity was added outside the secure flow: the session is refused and admins are alerted.
 */
export function unexpectedIdentities(ids: Identity[], linkedProviders: string[]): string[] {
  const all = [...ids].sort((a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? ''));
  const first = all[0]?.provider;
  return socialIdentities(all)
    .map((i) => i.provider)
    .filter((p, idx, arr) => arr.indexOf(p) === idx)
    .filter((p) => p !== first && !linkedProviders.includes(p));
}
