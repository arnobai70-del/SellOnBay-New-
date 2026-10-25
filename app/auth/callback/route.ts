import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { originOf } from '@/lib/publicOrigin';

/* OAuth return point: swap the code for a session, then send the user to their dashboard. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const origin = originOf(req); // the address the visitor used, never the server's own 0.0.0.0:3000
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  if (!code) return NextResponse.redirect(`${origin}/login?error=Sign-in failed. Try again.`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=Sign-in failed. Try again.`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // A code that reached the site root carries no next. If this person asked for a reset in the last hour, it was the reset link.
  const resetAsked = Date.parse(user?.recovery_sent_at ?? '');
  if (!next && Date.now() - resetAsked < 60 * 60 * 1000) return NextResponse.redirect(`${origin}/reset-password`);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
  return NextResponse.redirect(origin + (next || '/dashboard/' + (profile?.role ?? 'buyer')));
}
