import type { Metadata } from 'next';
import { AuthClient } from '@/components/AuthClient';
import { authenticatorRequired } from '@/lib/auth/authenticator';
import { signInOptions } from '@/lib/auth/socialService';
import { liveSiteKey } from '@/lib/bot/turnstile';
import { supabaseConfigured } from '@/lib/supabase/env';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to SellOnBay, or create a free account to buy and sell full-stack websites.',
  alternates: { canonical: '/signin' },
  robots: { index: false },
};

/* The sign-in logic is unchanged (components/AuthClient.tsx and its server actions): every safety check stays. Only the look and the address moved. */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string; mode?: string }> }) {
  const { error, next, sent, mode } = await searchParams;
  const social = await signInOptions(); // providers switched on in Supabase AND by SellOnBay's flags; Apple only as a secondary link
  return (
    <div className="g-auth">
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
    </div>
  );
}
