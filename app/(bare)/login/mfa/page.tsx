import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SiteNav } from '@/components/SiteNav';
import { MfaClient } from '@/components/MfaClient';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { navMenu } from '@/lib/seo/navStore';

export const metadata: Metadata = { title: 'Two-step sign in' };

export default async function Mfa({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Demo mode has no accounts and no authenticator to check.
  if (!supabaseConfigured) redirect('/login');
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  // Keep where they were going, so after the code they land there and not on the seller dashboard.
  if (!user) redirect('/login?next=' + encodeURIComponent(next ? `/login/mfa?next=${encodeURIComponent(next)}` : '/login/mfa'));
  return (
    <>
      <SiteNav menu={await navMenu()} />
      <MfaClient next={safeNext(next, '/dashboard/seller')} />
    </>
  );
}
