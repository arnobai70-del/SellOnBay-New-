import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ResetClient } from '@/components/ResetClient';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPassword() {
  // Demo mode has no accounts, so there is no password to reset.
  if (!supabaseConfigured) redirect('/signin');
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) redirect('/signin?error=' + encodeURIComponent('That reset link has expired. Request a new one.'));
  return (
    <div className="g-auth">
      <ResetClient />
    </div>
  );
}
