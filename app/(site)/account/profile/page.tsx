import type { Metadata } from 'next';
import Link from 'next/link';
import { ProfileForm } from '@/components/ProfileForm';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Your profile'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* The signed-in person's own profile: their name can be changed here; the email and the sign-in methods have their own pages. */
export default async function YourProfile() {
  const viewer = await requireViewer({ path: '/account/profile' });
  let name = '';
  let email = '';
  let failed = false;
  if (supabaseConfigured) {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user) {
      email = user.email ?? '';
      const { data, error } = await sb.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      if (error) failed = true;
      else name = data?.full_name ?? '';
    }
  }
  const home = viewer?.role === 'seller' ? '/dashboard/seller' : viewer?.role === 'admin' ? '/admin' : '/dashboard/buyer';
  return (
    <div className="wrap">
      <div className="sob-page-head">
        <h1>
          <T s={'Your profile'} />
        </h1>
        <p>
          <T s={'The name we use for you on orders, receipts and messages.'} />
        </p>
      </div>
      <div className="sob-prose" style={{ paddingBottom: 80 }}>
        {!supabaseConfigured ? (
          <p className="muted">
            <T s={'In demo mode there are no accounts, so there is no profile to change.'} />
          </p>
        ) : failed ? (
          <p className="sob-err" role="alert">
            <T s={'Could not load your profile just now. Reload the page to try again.'} />
          </p>
        ) : (
          <>
            <ProfileForm name={name} />
            {email && (
              <p className="muted" style={{ marginTop: 18 }}>
                <T s={'You sign in as {email}. To change how you sign in, open'} v={{ email }} />{' '}
                <Link href="/account/sign-in">
                  <T s={'Sign-in methods'} />
                </Link>
                .
              </p>
            )}
          </>
        )}
        <p style={{ marginTop: 24 }}>
          <Link className="btn ghost sm" href={home}>
            <T s={'Back to your dashboard'} />
          </Link>
        </p>
      </div>
    </div>
  );
}
