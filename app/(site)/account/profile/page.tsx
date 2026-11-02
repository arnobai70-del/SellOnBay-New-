import type { Metadata } from 'next';
import Link from 'next/link';
import { ProfileForm } from '@/components/ProfileForm';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Your profile', robots: { index: false } };
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
  const home = viewer?.role === 'seller' ? '/dashboard/seller' : viewer?.role === 'admin' ? '/dashboard/admin' : '/dashboard/buyer';
  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Your profile</h1>
        <p>The name we use for you on orders, receipts and messages.</p>
      </div>
      <div className="prose" style={{ paddingBottom: 80 }}>
        {!supabaseConfigured ? (
          <p className="muted">In demo mode there are no accounts, so there is no profile to change.</p>
        ) : failed ? (
          <p className="form-err" role="alert">
            Could not load your profile just now. Reload the page to try again.
          </p>
        ) : (
          <>
            <ProfileForm name={name} />
            {email && (
              <p className="muted" style={{ marginTop: 18 }}>
                You sign in as {email}. To change how you sign in, open <Link href="/account/sign-in">Sign-in methods</Link>.
              </p>
            )}
          </>
        )}
        <p style={{ marginTop: 24 }}>
          <Link className="btn btn-line btn-sm" href={home}>
            Back to your dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
