import 'server-only';
import { passedCode } from '@/lib/auth/authenticator';
import { NextResponse } from 'next/server';
import { cannotAct } from '../accounts';
import { supabaseConfigured } from '../supabase/env';
import { mayUseDemoAdmin } from './mode';
import { createClient } from '../supabase/server';
import { effectiveScopes, hasScope, type AdminScope } from './scopes';
import { hasSocialIdentity, type Identity } from '../auth/social';

/*
 * Every admin route starts here, naming the permission it needs (lib/admin/scopes.ts; a test checks every admin route names one).
 * The person must be signed in, an admin, not banned or suspended, have passed the authenticator code (aal2), and hold that permission.
 * Demo mode (no Supabase keys) has no accounts and lets everything through, like the rest of the prototype.
 */
export type AdminCheck = { ok: true; id: string | null; scopes: AdminScope[] } | { ok: false; res: NextResponse };
const no = (error: string, status: number): AdminCheck => ({ ok: false, res: NextResponse.json({ error }, { status }) });

type AdminProfile = { role: string; banned: boolean; suspended_until: string | null; admin_scopes: string[] | null };

/* Reads the admin's profile. Before migration 0055 there is no admin_scopes column: every admin is then a Super Admin, as before scopes existed. */
export async function readAdminProfile(sb: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<AdminProfile | null> {
  const full = await sb.from('profiles').select('role, banned, suspended_until, admin_scopes').eq('id', userId).single();
  if (!full.error) return full.data as AdminProfile;
  if (!/admin_scopes/.test(full.error.message)) return null;
  const old = await sb.from('profiles').select('role, banned, suspended_until').eq('id', userId).single();
  return old.data ? { ...(old.data as Omit<AdminProfile, 'admin_scopes'>), admin_scopes: null } : null;
}

export async function adminOnly(need: AdminScope | readonly AdminScope[]): Promise<AdminCheck> {
  if (!supabaseConfigured) {
    // Real deployment must never grant admin privileges because Supabase keys
    // are missing or demo mode was not explicitly opted into.
    if (!mayUseDemoAdmin(process.env)) return no('Admin authentication is unavailable.', 503);
    return { ok: true, id: null, scopes: ['super'] };
  }
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return no('Sign in first.', 401);
  const p = await readAdminProfile(sb, user.id);
  if (!p || cannotAct(p) || p.role !== 'admin') return no('Not allowed.', 403);
  if (hasSocialIdentity(user.identities as Identity[] | undefined)) return no('Admin accounts sign in with password and authenticator code only.', 403); // O-7
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!passedCode(aal)) return no('Enter your authenticator code first.', 403);
  const scopes = effectiveScopes(p.admin_scopes);
  if (!hasScope(scopes, need)) return no('Your admin account does not have permission for this.', 403);
  return { ok: true, id: user.id, scopes };
}
