import type { Metadata } from 'next';
import { AuthClient } from '@/components/AuthClient';
import { SiteNav } from '@/components/SiteNav';
import { authenticatorRequired } from '@/lib/auth/authenticator';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { supabaseConfigured } from '@/lib/supabase/env';
import { signInOptions } from '@/lib/auth/socialService';
import { navMenu } from '@/lib/seo/navStore';

export const metadata: Metadata = { title: 'Sign in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string }> }) {
  const { error, next, sent } = await searchParams;
  const social = await signInOptions(); // providers switched on in Supabase AND by SellOnBay's flags; Apple only as a secondary link
  return (
    <>
      <SiteNav menu={await navMenu()} />
      <AuthClient
        live={supabaseConfigured}
        error={error}
        next={next}
        sent={sent === '1'}
        botKey={liveSiteKey()}
        oauth={social.providers}
        appleExisting={social.appleExisting}
        codeRequired={authenticatorRequired()}
      />
    </>
  );
}
