import type { Metadata } from 'next';
import { SignInMethods } from '@/components/SignInMethods';
import { PROVIDERS, type SocialProvider } from '@/lib/auth/social';
import { providerOn } from '@/lib/auth/socialService';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Sign-in methods'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/*
 * The account's sign-in methods (Addendum 3). Linking another login is done only from here, after signing in again recently (sellers also
 * enter their authenticator code again), and every link is recorded and emailed. Admin accounts use password and authenticator code only.
 */
export default async function SignInMethodsPage({ searchParams }: { searchParams: Promise<{ linked?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/account/sign-in' });
  const { linked } = await searchParams;
  const user = supabaseConfigured ? (await (await createClient()).auth.getUser()).data.user : null;
  const ids = user?.identities ?? [];
  const isAdmin = viewer?.role === 'admin';
  const providers = (['google', 'azure', 'github', 'gitlab'] as SocialProvider[]).concat(ids.some((i) => i.provider === 'apple') ? ['apple'] : []);
  const rows = [
    { provider: 'email', label: tx('Email and password'), since: null as string | null, linked: ids.some((i) => i.provider === 'email'), available: false },
    ...(await Promise.all(
      providers.map(async (p) => {
        const id = ids.find((i) => i.provider === p);
        return { provider: p, label: PROVIDERS[p].label, since: id?.created_at ? id.created_at.slice(0, 10) : null, linked: !!id, available: p !== 'apple' && (await providerOn(p)) };
      }),
    )),
  ];
  return (
    <div className="wrap">
      <div className="sob-page-head">
        <h1>
          <T s={'Sign-in methods'} />
        </h1>
        <p>
          <T s={'How you sign in to SellOnBay.'} />
        </p>
      </div>
      <div className="sob-prose" style={{ paddingBottom: 80 }}>
        {linked && (
          <p className="note">
            <T s={'That sign-in is now linked. We sent you an email about it.'} />
          </p>
        )}
        {!user ? (
          <p className="muted">
            <T s={'Sign-in methods need an account. There are none in demo mode.'} />
          </p>
        ) : (
          <>
            {isAdmin ? (
              <p>
                <T s={'Admin accounts sign in with password and authenticator code only. Other sign-ins cannot be linked.'} />
              </p>
            ) : (
              <p>
                <T
                  s={
                    'To link another sign-in, sign in again first{v0}, then link it within 10 minutes. A linked sign-in never replaces your authenticator code. You always keep at least one way to sign in.'
                  }
                  v={{ v0: viewer?.role === 'seller' ? ' and enter your authenticator code' : '' }}
                />
              </p>
            )}
            <SignInMethods rows={rows} canLink={!isAdmin} />
          </>
        )}
      </div>
    </div>
  );
}
