import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unlinkProblem, type Identity } from '@/lib/auth/social';
import { logLink, startLink } from '@/lib/auth/socialService';
import { originOf } from '@/lib/publicOrigin';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ action: z.enum(['link', 'unlink']), provider: z.string().max(20) });

/*
 * Links or unlinks a social sign-in from account settings (Addendum 3, link intents). Linking needs a fresh re-authentication (and for sellers
 * a fresh authenticator code), a provider that SellOnBay has switched on, and never an admin account. The callback links only with the
 * single-use intent made here. Every provider is switched off until blocker B-7 clears, so linking answers "not available" today.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('auth'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  if (!supabaseConfigured) return jsonT({ error: tx('This needs an account. There are none in demo mode.') }, { status: 404 });
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return jsonT({ error: tx('Sign in first.') }, { status: 401 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const [{ data: p }, { data: aal }] = await Promise.all([sb.from('profiles').select('role').eq('id', user.id).single(), sb.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const role = p?.role ?? 'buyer';
  const ids = (user.identities ?? []) as Identity[];
  if (body.data.action === 'unlink') {
    const problem = unlinkProblem(ids, body.data.provider);
    if (problem) return jsonT({ error: problem }, { status: 409 });
    const identity = (user.identities ?? []).find((i) => i.provider === body.data.provider);
    const { error } = identity ? await sb.auth.unlinkIdentity(identity) : { error: new Error('missing') };
    if (error) return jsonT({ error: tx('Could not remove that sign-in. Try again.') }, { status: 502 });
    await logLink(user.id, body.data.provider, 'unlinked');
    return NextResponse.json({ ok: true });
  }
  const amr = ((aal?.currentAuthenticationMethods ?? []) as { method: string; timestamp: number }[]).filter((m) => typeof m === 'object');
  const r = await startLink({ id: user.id, role, amr }, body.data.provider);
  if (!r.ok) return jsonT({ error: r.error }, { status: 409 });
  const { data, error } = await sb.auth.linkIdentity({
    provider: r.intent.provider,
    options: { redirectTo: `${originOf(req)}/auth/callback?link=${r.intent.id}`, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return jsonT({ error: tx('Could not start linking. Try again.') }, { status: 502 });
  return NextResponse.json({ ok: true, url: data.url });
}
