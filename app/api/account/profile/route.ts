import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cleanProfileName } from '@/lib/account/profileName';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ name: z.string().max(200) });

/*
 * Changes the signed-in person's own name. It runs with their own session, not the service key, so the database decides too: the row policy
 * lets a person update only their own profile, and the column grant (0004_grants.sql) only full_name. Nothing else on the profile is writable.
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
  const c = cleanProfileName(body.data.name);
  if (!c.ok) return jsonT({ error: c.error }, { status: 400 });
  const name = c.name;
  if (!(await limit(`profile:${user.id}`, 10, 60 * 60 * 1000))) return jsonT({ error: tx('You changed your name many times just now. Try again in an hour.') }, { status: 429 });
  const { data, error } = await sb.from('profiles').update({ full_name: name }).eq('id', user.id).select('id');
  if (error || !data?.length) {
    console.error('account: could not save the name', error?.message ?? 'no row updated');
    return jsonT({ error: tx('Could not save your name. Try again in a moment.') }, { status: 500 });
  }
  return NextResponse.json({ ok: true, name });
}
