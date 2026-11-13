import { PublicFrame } from '@/components/glass/PublicFrame';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ResetClient } from '@/components/ResetClient';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Choose a new password') });

export default async function ResetPassword() {
  // Demo mode has no accounts, so there is no password to reset.
  if (!supabaseConfigured) redirect('/signin');
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) redirect('/signin?error=' + encodeURIComponent('That reset link has expired. Request a new one.'));
  return (
    <PublicFrame file="account-access">
      <ResetClient />
    </PublicFrame>
  );
}
