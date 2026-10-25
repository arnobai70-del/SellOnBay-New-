import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { originOf } from '@/lib/publicOrigin';
import { safeNext } from '@/lib/safeNext';

const TYPES: EmailOtpType[] = ['signup', 'recovery', 'email_change', 'invite', 'magiclink', 'email'];
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/*
 * Email link return point that works in any browser: the link carries a token hash instead of a code tied to the browser that asked.
 * Used when the Supabase email templates link to {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=... (see docs/RUNBOOK.md).
 * Mail programs and virus scanners open links before the person does and would use the one-time token up, so opening the link only shows a button;
 * pressing it (a POST) is what confirms the address.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tokenHash = searchParams.get('token_hash') ?? '';
  const type = searchParams.get('type') ?? '';
  if (!tokenHash || !TYPES.includes(type as EmailOtpType)) return NextResponse.redirect(`${originOf(req)}/login?error=${encodeURIComponent('That link is not valid. Request a new one.')}`);
  const next = safeNext(searchParams.get('next'));
  const what = type === 'recovery' ? 'Choose a new password' : 'Confirm my email';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(what)} · SellOnBay</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#F3F5FA;color:#0F1330">
<form method="post" action="/auth/confirm" style="background:#fff;padding:32px;border-radius:16px;max-width:380px;text-align:center;box-shadow:0 8px 30px rgba(15,19,48,.08)">
<h1 style="font-size:22px;margin:0 0 8px">SellOnBay</h1><p style="margin:0 0 20px;color:#555b7a">One more step: press the button to continue.</p>
<input type="hidden" name="token_hash" value="${esc(tokenHash)}"><input type="hidden" name="type" value="${esc(type)}"><input type="hidden" name="next" value="${esc(next)}">
<button type="submit" style="background:#2B3DFF;color:#fff;border:0;border-radius:999px;padding:12px 24px;font-size:16px;font-weight:600;cursor:pointer">${esc(what)}</button></form></body></html>`;
  return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export async function POST(req: NextRequest) {
  const origin = originOf(req);
  const form = await req.formData().catch(() => null);
  const tokenHash = String(form?.get('token_hash') ?? '');
  const type = String(form?.get('type') ?? '') as EmailOtpType;
  const failed = `${origin}/login?error=${encodeURIComponent('That link has expired or was already used. Request a new one.')}`;
  if (!tokenHash || !TYPES.includes(type)) return NextResponse.redirect(failed, 303);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return NextResponse.redirect(failed, 303);
  if (type === 'recovery') return NextResponse.redirect(`${origin}/reset-password`, 303);
  const next = safeNext(String(form?.get('next') ?? '') || null);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
  return NextResponse.redirect(origin + (next || '/dashboard/' + (profile?.role ?? 'buyer')), 303);
}
