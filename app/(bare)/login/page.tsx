import type { Metadata } from 'next';
import { AuthClient } from '@/components/AuthClient';
import { SiteNav } from '@/components/SiteNav';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { supabaseConfigured } from '@/lib/supabase/env';
import { enabledOAuth } from '@/lib/supabase/oauth';
import { navMenu } from '@/lib/seo/navStore';

export const metadata: Metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string }> }) {
  const { error, next, sent } = await searchParams;
  return (
    <>
      <SiteNav menu={await navMenu()} />
      <AuthClient live={supabaseConfigured} error={error} next={next} sent={sent === '1'} botKey={liveSiteKey()} oauth={await enabledOAuth()} />
    </>
  );
}
