import 'server-only';
import { NextResponse } from 'next/server';
import { cannotAct, mayBuy } from '../accounts';
import { supabaseConfigured } from '../supabase/env';
import { createClient } from '../supabase/server';

/*
 * Server-side checks for the SellOnBay 2.0 buyer and seller API routes (the admin ones use lib/admin/guard.ts).
 * Buyers: signed in, a buyer account, not banned or suspended. Sellers: the same, a seller account, and the authenticator code (aal2).
 * There are no accounts in demo mode, so these routes answer 404 there instead of guessing.
 */
export type Who = { ok: true; id: string; name: string; email: string | null } | { ok: false; res: NextResponse };
const no = (error: string, status: number): Who => ({ ok: false, res: NextResponse.json({ error }, { status }) });

async function signedIn(): Promise<{ ok: true; id: string; email: string | null; role: string; name: string; aal2: boolean } | { ok: false; res: NextResponse }> {
  if (!supabaseConfigured) return { ok: false, res: NextResponse.json({ error: 'This needs an account. There are none in demo mode.' }, { status: 404 }) };
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Sign in first.' }, { status: 401 }) };
  const [{ data: p }, { data: aal }] = await Promise.all([
    sb.from('profiles').select('role, full_name, banned, suspended_until').eq('id', user.id).single(),
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (!p || cannotAct(p)) return { ok: false, res: NextResponse.json({ error: 'This account cannot do that right now.' }, { status: 403 }) };
  return { ok: true, id: user.id, email: user.email ?? null, role: p.role ?? 'buyer', name: p.full_name || 'You', aal2: aal?.currentLevel === 'aal2' };
}

export async function buyerOnly(): Promise<Who> {
  const s = await signedIn();
  if (!s.ok) return s;
  if (!mayBuy(s.role)) return no('Only a buyer account can do this. Seller and admin accounts cannot buy.', 403);
  return { ok: true, id: s.id, name: s.name, email: s.email };
}

export async function sellerOnly(): Promise<Who> {
  const s = await signedIn();
  if (!s.ok) return s;
  if (s.role !== 'seller') return no('Only a seller account can do this.', 403);
  if (!s.aal2) return no('Enter your authenticator code first.', 403);
  return { ok: true, id: s.id, name: s.name, email: s.email };
}
