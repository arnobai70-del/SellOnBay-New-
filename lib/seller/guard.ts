import 'server-only';
import { jsonT } from '../i18n/jsonT';
import { tx } from '../i18n/tx';
import { NextResponse } from 'next/server';
import { passedCode } from '../auth/authenticator';
import { cannotAct } from '../accounts';
import { createClient } from '../supabase/server';

/* A seller acting on their own things: signed in, not blocked, a seller, and past the authenticator code. One check for the seller APIs of the redesign. */
export async function sellerOnly(): Promise<{ ok: true; id: string; name: string } | { ok: false; res: NextResponse }> {
  const no = async (error: string, status: number) => ({ ok: false as const, res: await jsonT({ error }, { status }) });
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return no(tx('Sign in first.'), 401);
  const [{ data: p }, { data: aal }] = await Promise.all([
    sb.from('profiles').select('role, full_name, banned, suspended_until').eq('id', user.id).single(),
    sb.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (!p || cannotAct(p)) return no(tx('This account cannot do that.'), 403);
  if (p.role !== 'seller') return no(tx('Only a seller account can do this.'), 403);
  if (!passedCode(aal)) return no(tx('Enter your authenticator code first.'), 403);
  return { ok: true, id: user.id, name: p.full_name || 'Seller' };
}
