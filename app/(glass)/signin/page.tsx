import type { Metadata } from 'next';
import { BrandMark } from '@/components/glass/BrandMark';
import Link from 'next/link';
import { AuthClient } from '@/components/AuthClient';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { authenticatorRequired } from '@/lib/auth/authenticator';
import { signInOptions } from '@/lib/auth/socialService';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { BRAND_NAME } from '@/lib/brand';
import { supabaseConfigured } from '@/lib/supabase/env';

import { getI18n } from '@/lib/i18n/server';
import { localizeMetadata } from '@/lib/i18n/seo';
// The page's words in its language; localizeMetadata adds its own address, the other languages and an admin's SEO words for that language.
export const generateMetadata = async (): Promise<Metadata> => {
  const { tx } = await getI18n();
  return localizeMetadata('/signin', {
    title: tx('Sign in'),
    description: tx('Sign in to SellOnBay, or create a free account to buy and sell full-stack websites.'),
    alternates: { canonical: '/signin' },
    robots: { index: false },
  });
};

/*
 * design-reference/signin.html: the logo alone on top, then the card. The sign-in logic is unchanged (components/AuthClient.tsx and its server
 * actions): every safety check stays.
 */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string; mode?: string }> }) {
  const { error, next, sent, mode } = await searchParams;
  const social = await signInOptions(); // providers switched on in Supabase AND by SellOnBay's flags; Apple only as a secondary link
  return (
    <PublicFrame file="signin" chrome={false}>
      <div data-auth-top style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>
        <Link className="logo" href="/" style={{ padding: '18px 0' }} prefetch={false}>
          <BrandMark />
          {BRAND_NAME}
        </Link>
      </div>
      <AuthClient
        live={supabaseConfigured}
        error={error}
        next={next}
        sent={sent === '1'}
        startMode={mode === 'signup' ? 'signup' : mode === 'forgot' ? 'forgot' : undefined}
        botKey={liveSiteKey()}
        oauth={social.providers}
        appleExisting={social.appleExisting}
        codeRequired={authenticatorRequired()}
      />
    </PublicFrame>
  );
}
