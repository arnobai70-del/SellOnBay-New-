import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { originOf } from '@/lib/publicOrigin';
import { callbackGuard } from '@/lib/auth/socialService';
import type { Identity } from '@/lib/auth/social';

/*
 * OAuth return point: swap the code for a session, then send the user to their dashboard. The social sign-in guard (lib/auth/socialService.ts)
 * runs here as an extra layer: it refuses admin accounts, switched-off providers, new Apple accounts, links without a valid intent and
 * identities that were never linked. It is not the main protection (Addendum 3.1): providers stay off until Supabase Auth itself is safe.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const origin = originOf(req); // the address the visitor used, never the server's own 0.0.0.0:3000
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  if (!code) return NextResponse.redirect(`${origin}/signin?error=Sign-in failed. Try again.`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/signin?error=Sign-in failed. Try again.`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // A code that reached the site root carries no next. If this person asked for a reset in the last hour, it was the reset link.
  const resetAsked = Date.parse(user?.recovery_sent_at ?? '');
  if (!next && Date.now() - resetAsked < 60 * 60 * 1000) return NextResponse.redirect(`${origin}/reset-password`);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single();
  const guard = await callbackGuard(
    { id: user!.id, role: profile?.role ?? 'buyer', identities: (user!.identities ?? []) as Identity[], createdAt: Date.parse(user!.created_at), email: user!.email },
    searchParams.get('link'),
  );
  if (!guard.ok) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(guard.message)}`);
  }
  if (guard.linked) return NextResponse.redirect(`${origin}/account/sign-in?linked=${guard.linked}`);
  return NextResponse.redirect(origin + (next || '/dashboard/' + (profile?.role ?? 'buyer')));
}
