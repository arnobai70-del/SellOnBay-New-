import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COOKIE, isCode, liveLanguages } from '@/lib/i18n/config';
import { languageSettings } from '@/lib/i18n/settingsRead';
import { maintenanceFor } from '@/lib/maintenance/service';
import { limit } from '@/lib/rateLimit';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({ lang: z.string().max(5) });

/*
 * The visitor's language choice (lib/i18n, owner 2026-11-12): remembered in this browser (cookie sob_lang, a year; sign-in and sign-out keep it)
 * and, for a signed-in person, in their account (user metadata "lang", no table change) so it follows them to another device. Only a live
 * language is accepted. Never required: without an account the cookie is enough.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('auth');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const lang = body.data.lang.toLowerCase();
  if (!isCode(lang) || !liveLanguages(await languageSettings()).some((l) => l.code === lang)) return NextResponse.json({ error: 'That language is not available.' }, { status: 400 });
  let saved = false;
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user && (await limit(`lang:${user.id}`, 20, 3_600_000)) && user.user_metadata?.lang !== lang) saved = !(await sb.auth.updateUser({ data: { lang } })).error;
  }
  const res = NextResponse.json({ ok: true, saved });
  res.cookies.set(COOKIE, lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res;
}
