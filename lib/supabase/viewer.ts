import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { mayUseDemoAdmin } from '@/lib/admin/mode';
import { createAdminClient, createClient } from './server';
import { supabaseConfigured } from './env';
import { cannotAct, mayBuy } from '@/lib/accounts';
import { moduleOfPage } from '@/lib/maintenance/config';
import { maintenancePage } from '@/lib/maintenance/guard';
import { closedRow } from '@/lib/maintenance/state';

export type ViewerRole = 'buyer' | 'seller' | 'admin';

/* The signed-in person, or null in demo mode / signed out. */
export async function getViewer() {
  if (!supabaseConfigured) return null;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: p } = await sb.from('profiles').select('full_name, role').eq('id', user.id).single();
  return { name: p?.full_name || user.email || 'You', role: (p?.role ?? 'buyer') as ViewerRole };
}

/*
 * Server-side page guard. proxy.ts also checks this, but a Server Action redirect (for example right after sign in)
 * renders the next page without going through the proxy, so every protected page must check for itself.
 * Demo mode (no Supabase keys) lets everything through, except seller and admin pages on a production server not marked as a demo
 * (missing keys there must never open the admin pages to everybody).
 * roles: who may open this page. Sellers and admins must also have passed the authenticator code (aal2).
 */
export async function requireViewer(opts: { path: string; roles?: ViewerRole[] }) {
  // Module maintenance, checked here too because a Server Action redirect skips proxy.ts. Only an admin with the code passes (not for the admin module).
  const mod = moduleOfPage(opts.path);
  const closed = mod ? await closedRow(mod) : null;
  if (mod && closed && (!supabaseConfigured || mod === 'admin')) redirect(maintenancePage(mod));
  if (!supabaseConfigured) {
    if (opts.roles && !opts.roles.includes('buyer') && !mayUseDemoAdmin(process.env)) notFound();
    return null;
  }
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent(opts.path));

  // The profile and the authenticator level are read at the same time (two round trips to the database became one wait).
  const [{ data: p }, { data: aal }] = await Promise.all([sb.from('profiles').select('full_name, role, banned, suspended_until').eq('id', user.id).single(), sb.auth.mfa.getAuthenticatorAssuranceLevel()]);
  if (!p || cannotAct(p)) redirect('/login?error=' + encodeURIComponent('This account cannot sign in.'));
  const role = (p.role ?? 'buyer') as ViewerRole;

  if (opts.roles && !opts.roles.includes(role)) redirect('/dashboard/' + role);

  if (role !== 'buyer') {
    if (aal?.currentLevel !== 'aal2') redirect('/login/mfa?next=' + encodeURIComponent(opts.path));
  }
  if (mod && closed && role !== 'admin') redirect(maintenancePage(mod));
  return { name: p.full_name || user.email || 'You', role };
}

/* Can this signed-in account buy? Only buyer accounts can; signed out (or demo mode) is left to each route. */
export async function viewerMayBuy(id: string | null | undefined): Promise<boolean> {
  if (!supabaseConfigured || !id) return true;
  const sb = await createClient();
  const { data: p } = await sb.from('profiles').select('role').eq('id', id).single();
  return mayBuy(p?.role);
}

/* Is this signed-in account banned or suspended right now? Signed out (or demo mode) is not: those routes check their own access. */
export async function viewerBlocked(id: string | null | undefined): Promise<boolean> {
  if (!supabaseConfigured || !id) return false;
  const sb = await createClient();
  const { data: p } = await sb.from('profiles').select('banned, suspended_until').eq('id', id).single();
  return cannotAct(p);
}

/* Someone else's account (the seller of a listing, a developer to hire): true when it is banned or suspended, so it cannot be bought from. */
export async function accountLockedOut(id: string | null | undefined): Promise<boolean> {
  if (!supabaseConfigured || !id) return false;
  const { data: p } = await createAdminClient().from('profiles').select('banned, suspended_until').eq('id', id).maybeSingle();
  return cannotAct(p);
}

/* Sellers and admins need the authenticator code (aal2) for anything about their account; true means this session has not passed it. */
export async function staffNeedsCode(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if ((p?.role ?? 'buyer') === 'buyer') return false;
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return aal?.currentLevel !== 'aal2';
}

/*
 * A listing that is not live (in review, rejected, paused): only its seller and admins may open it, and, like every seller and admin page,
 * only after the authenticator code. Used by the product, preview, checkout and hosted demo routes.
 */
export async function mayViewUnreleased(sellerId: string | null | undefined): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  if (user.id !== sellerId) {
    const { data: me } = await sb.from('profiles').select('role').eq('id', user.id).single();
    if (me?.role !== 'admin') return false;
  }
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return aal?.currentLevel === 'aal2';
}

/* Just the signed-in user's id (or undefined), for pages that show a draft only to its owner. */
export async function getViewerId(): Promise<string | undefined> {
  if (!supabaseConfigured) return undefined;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user?.id;
}
