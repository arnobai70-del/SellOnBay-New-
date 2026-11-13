import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/(bare)/login/actions';
import { DetailsForm } from '@/components/glass/DetailsForm';
import { SellerPlanCard } from '@/components/glass/SellerPlanCard';
import { SellerShell } from '@/components/glass/SellerShell';
import { ProfileForm } from '@/components/ProfileForm';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Account and security'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/*
 * design-reference/seller-account.html: name, country and contact details (the country decides the payout methods), sign-in safety (seller pages
 * always ask for the authenticator code), this device, selling preferences (kept in the store profile), the emails we send, buying and your data.
 */
export default async function SellerAccount() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/account', roles: ['seller', 'admin'] });
  let d = { country: '', phone: '', company: '' };
  if (viewer && supabaseConfigured) {
    const { data } = await createAdminClient().from('profiles').select('*').eq('id', viewer.id).single();
    d = { country: data?.country ?? '', phone: data?.phone ?? '', company: data?.company ?? '' };
  }
  return (
    <SellerShell viewer={viewer} active="account" file="seller-account" title={tx('Account & security')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Account & security'} />
          </h1>
          <div className="tag">
            <T s={'Profile, sign-in safety and notification settings'} />
          </div>
        </div>
      </div>
      <div className="grid2">
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>
            <T s={'Profile & billing'} />
          </h2>
          <ProfileForm name={viewer?.name ?? ''} />
          <DetailsForm {...d} />
          <div className="tag" style={{ margin: 0 }}>
            <T s={'Buyers never see your phone or email. Your country decides which payout methods you can use; payout details live in Earnings & payouts.'} />
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 6 }}>
            <T s={'Sign-in safety'} />
          </h2>
          <div className="li">
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>
                <T s={'Two-factor login'} />
              </b>
              <div className="tag">
                <T s={'Seller pages always ask for your authenticator code'} />
              </div>
            </div>
            <span className="status st-ok">
              <T s={'On'} />
            </span>
          </div>
          <div className="li">
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>
                <T s={'Password'} />
              </b>
              <div className="tag">
                <T s={'We email you a link to set a new one'} />
              </div>
            </div>
            <Link className="btn sm ghost" href="/signin?mode=forgot" prefetch={false}>
              <T s={'Change'} />
            </Link>
          </div>
          <div className="li">
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>
                <T s={'Sign-in methods'} />
              </b>
              <div className="tag">
                <T s={'Link Google or an email link to your account'} />
              </div>
            </div>
            <Link className="btn sm ghost" href="/account/sign-in" prefetch={false}>
              <T s={'Manage'} />
            </Link>
          </div>
        </section>
      </div>
      <section className="glass card">
        <div className="row" style={{ marginBottom: 6 }}>
          <h2>
            <T s={"Where you're signed in"} />
          </h2>
          {viewer && (
            <form action={signOut}>
              <button className="btn sm warn" type="submit">
                <T s={'Sign out'} />
              </button>
            </form>
          )}
        </div>
        <div className="li">
          <div style={{ flex: 1, fontSize: 14 }}>
            <b style={{ fontWeight: 500 }}>
              <T s={'This browser'} />
            </b>
            <div className="tag">
              <T s={'Active now. Other devices are not listed yet; changing your password signs them out.'} />
            </div>
          </div>
          <span className="status st-ok">
            <T s={'This device'} />
          </span>
        </div>
      </section>
      <div className="grid2">
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>
            <T s={'Selling preferences'} />
          </h2>
          <div className="row" style={{ fontSize: 14, minHeight: 40 }}>
            <span>
              <T s={'Pause my store, reply time and the customization badge'} />
            </span>
            <Link className="btn sm ghost" href="/dashboard/seller/store#profile" prefetch={false}>
              <T s={'Store profile'} />
            </Link>
          </div>
          <div className="tag" style={{ margin: 0 }}>
            <T s={'While paused, your websites stay visible but cannot be bought.'} />
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 6 }}>
            <T s={'Emails'} />
          </h2>
          {['New sale and payout emails', 'Dispute and question alerts', 'Listing decisions'].map((l) => (
            <div key={l} className="row" style={{ fontSize: 14, minHeight: 40 }}>
              <span>{l}</span>
              <span className="status st-ok">
                <T s={'Always sent'} />
              </span>
            </div>
          ))}
        </section>
      </div>
      <section className="glass card">
        <div className="row">
          <div>
            <h2>
              <T s={'Buying and your data'} />
            </h2>
            <div className="tag">
              <T s={'Your account can buy too. Download a copy of your data, or ask us to delete your account.'} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn sm ghost" href="/dashboard/buyer" prefetch={false}>
              <T s={'Buyer dashboard'} />
            </Link>
            <Link className="btn sm ghost" href="/account/privacy" prefetch={false}>
              <T s={'Your data'} />
            </Link>
          </div>
        </div>
      </section>
      {viewer && <SellerPlanCard sellerId={viewer.id} />}
    </SellerShell>
  );
}
