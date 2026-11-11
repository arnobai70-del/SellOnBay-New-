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

export const metadata: Metadata = { title: 'Account and security', robots: { index: false } };
export const dynamic = 'force-dynamic';

/*
 * design-reference/buyer-account.html: name (ProfileForm), details for invoices and domains (/api/account/details), sign-in safety, this device,
 * coupons, the emails we send, your data and selling. Preferences per email and a list of other devices are not kept yet; they say so.
 */
export default async function BuyerAccount() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/account', roles: ['buyer', 'seller', 'admin'] });
  let d = { country: '', phone: '', company: '' };
  if (viewer && supabaseConfigured) {
    // '*' so the page keeps working before migration 0078; only these three fields are shown.
    const { data } = await createAdminClient().from('profiles').select('*').eq('id', viewer.id).single();
    d = { country: data?.country ?? '', phone: data?.phone ?? '', company: data?.company ?? '' };
  }
  return (
    <BuyerShell viewer={viewer} active="account" file="buyer-account" title="Account & security" head={false}>
      <div className="row">
        <div>
          <h1>Account &amp; security</h1>
          <div className="tag">Profile, details for invoices, sign-in safety and your data</div>
        </div>
      </div>
      <div className="grid2">
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>Profile &amp; billing</h2>
          <ProfileForm name={viewer?.name ?? ''} />
          <DetailsForm {...d} />
          <div className="tag" style={{ margin: 0 }}>
            Domains are registered with these details. Sellers never see your phone or email.
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 6 }}>Sign-in safety</h2>
          <div className="li">
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>Sign-in methods</b>
              <div className="tag">Link Google or an email link to your account</div>
            </div>
            <Link className="btn sm ghost" href="/account/sign-in" prefetch={false}>
              Manage
            </Link>
          </div>
          <div className="li">
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>Password</b>
              <div className="tag">We email you a link to set a new one</div>
            </div>
            <Link className="btn sm ghost" href="/signin?mode=forgot" prefetch={false}>
              Change
            </Link>
          </div>
          <div className="li">
            <div style={{ flex: 1, fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>Two-factor login</b>
              <div className="tag">An authenticator code is asked for on the seller pages</div>
            </div>
            <span className={viewer?.role === 'seller' ? 'status st-ok' : 'status st-draft'}>{viewer?.role === 'seller' ? 'On' : 'For sellers'}</span>
          </div>
        </section>
      </div>
      <section className="glass card">
        <div className="row" style={{ marginBottom: 6 }}>
          <h2>Where you&apos;re signed in</h2>
          {viewer && (
            <form action={signOut}>
              <button className="btn sm warn" type="submit">
                Sign out
              </button>
            </form>
          )}
        </div>
        <div className="li">
          <div style={{ flex: 1, fontSize: 14 }}>
            <b style={{ fontWeight: 500 }}>This browser</b>
            <div className="tag">Active now. Other devices are not listed yet; changing your password signs them out.</div>
          </div>
          <span className="status st-ok">This device</span>
        </div>
      </section>
      <div className="grid2">
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>My coupons</h2>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>Enter a coupon code at checkout. The discount is shown before you confirm.</span>
          </div>
          <div className="tag" style={{ margin: 0 }}>
            During the beta websites are free, so no coupon is needed.
          </div>
        </section>
        <section className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 6 }}>Emails</h2>
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
          <h2>Your data</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>
            Download a copy of your data, or ask us to delete your account.
          </p>
          <Link className="btn sm ghost" href="/account/privacy" prefetch={false}>
            Your data
          </Link>
        </section>
        {viewer && (
          <section className="glass card">
            <h2>Selling</h2>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>
              {viewer.role === 'seller'
                ? 'Your account sells too. Seller pages ask for your authenticator code.'
                : 'Sell your own websites from this account and keep buying as before. Seller pages ask you to set up an authenticator code.'}
            </p>
            {viewer.role === 'seller' ? (
              <Link className="btn sm ghost" href="/dashboard/seller" prefetch={false}>
                Seller dashboard
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
