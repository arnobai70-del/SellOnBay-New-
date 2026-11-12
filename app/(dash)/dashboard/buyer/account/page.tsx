import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from '@/app/(bare)/login/actions';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { DetailsForm } from '@/components/glass/DetailsForm';
import { SellSwitch } from '@/components/glass/SellerForms';
import { ProfileForm } from '@/components/ProfileForm';
import { CONFIG } from '@/lib/config';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Account and security', robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * design-reference/buyer-account.html: name (ProfileForm), details for invoices and domains (/api/account/details), sign-in safety, this device,
 * coupons, the emails we send, your data and selling. Preferences per email and a list of other devices are not kept yet; they say so.
 */
export default async function BuyerAccount() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/buyer/account', roles: ['buyer', 'seller', 'admin'] });
  let d = { country: '', phone: '', company: '' };
  if (viewer && supabaseConfigured) {
    // '*' so the page keeps working before migration 0078; only these three fields are shown.
    const { data } = await createAdminClient().from('profiles').select('*').eq('id', viewer.id).single();
    d = { country: data?.country ?? '', phone: data?.phone ?? '', company: data?.company ?? '' };
  }
  return (
    <BuyerShell viewer={viewer} active="account" file="buyer-account" title={tx('Account & security')} head={false}>
      <div className="row">
        <div>
          <h1>
            <T s={'Account & security'} />
          </h1>
          <div className="tag">
            <T s={'Profile, details for invoices, sign-in safety and your data'} />
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
            <T s={'Domains are registered with these details. Sellers never see your phone or email.'} />
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 6 }}>
            <T s={'Sign-in safety'} />
          </h2>
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
                <T s={'Two-factor login'} />
              </b>
              <div className="tag">
                <T s={'An authenticator code is asked for on the seller pages'} />
              </div>
            </div>
            <span className={viewer?.role === 'seller' ? 'status st-ok' : 'status st-draft'}>{viewer?.role === 'seller' ? 'On' : 'For sellers'}</span>
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
            <T s={'My coupons'} />
          </h2>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              <T s={'Enter a coupon code at checkout. The discount is shown before you confirm.'} />
            </span>
          </div>
          <div className="tag" style={{ margin: 0 }}>
            <T s={'During the beta websites are free, so no coupon is needed.'} />
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 6 }}>
            <T s={'Emails'} />
          </h2>
          {[
            ['Order and payment updates', 'Always sent'],
            [`Domain expiry reminders (${CONFIG.domain.reminderDays.join(', ')} days before)`, 'Always sent'],
            ['Answers to your tickets', 'Always sent'],
          ].map(([l, s]) => (
            <div key={l} className="row" style={{ fontSize: 14, minHeight: 40 }}>
              <span>{l}</span>
              <span className="status st-ok">{s}</span>
            </div>
          ))}
        </section>
      </div>
      <div className="grid2">
        <section className="glass card">
          <h2>
            <T s={'Your data'} />
          </h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>
            <T s={'Download a copy of your data, or ask us to delete your account.'} />
          </p>
          <Link className="btn sm ghost" href="/account/privacy" prefetch={false}>
            <T s={'Your data'} />
          </Link>
        </section>
        {viewer && (
          <section className="glass card">
            <h2>
              <T s={'Selling'} />
            </h2>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>
              {viewer.role === 'seller'
                ? 'Your account sells too. Seller pages ask for your authenticator code.'
                : 'Sell your own websites from this account and keep buying as before. Seller pages ask you to set up an authenticator code.'}
            </p>
            {viewer.role === 'seller' ? (
              <Link className="btn sm ghost" href="/dashboard/seller" prefetch={false}>
                <T s={'Seller dashboard'} />
              </Link>
            ) : (
              <SellSwitch />
            )}
          </section>
        )}
      </div>
    </BuyerShell>
  );
}
