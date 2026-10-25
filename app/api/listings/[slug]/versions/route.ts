import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cannotAct } from '@/lib/accounts';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { publishVersion } from '@/lib/versions';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ version: z.string().max(40), changelog: z.string().max(4000), fileUrl: z.string().max(1000) });
const no = (error: string, status: number) => NextResponse.json({ error }, { status });

/* The seller of a live digital listing publishes a new version. Needs the authenticator code. An admin looks at it and approves it. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const closed = await maintenanceFor('upload'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const { slug } = await params;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return no('Sign in first.', 401);
  const { data: me } = await sb.from('profiles').select('banned, suspended_until').eq('id', user.id).single();
  if (!me || cannotAct(me)) return no('This account cannot do that.', 403);
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return no('Enter your authenticator code first.', 403);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await publishVersion(user.id, slug, body.data);
  return r.ok ? NextResponse.json({ ok: true, id: r.value.id, status: r.value.status }) : no(r.error, r.status);
}
