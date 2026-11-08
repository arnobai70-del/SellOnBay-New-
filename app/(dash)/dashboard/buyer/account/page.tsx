import type { Metadata } from 'next';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { Button } from '@/components/glass/Button';
import { DetailsForm } from '@/components/glass/DetailsForm';
import { GlassCard } from '@/components/glass/GlassCard';
import { SellSwitch } from '@/components/glass/SellerForms';
import { ProfileForm } from '@/components/ProfileForm';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Account and security', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function BuyerAccount() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/account', roles: ['buyer', 'seller'] });
  let d = { country: '', phone: '', company: '' };
  if (viewer && supabaseConfigured) {
    // '*' so the page keeps working before migration 0078; only these three fields are shown.
    const { data } = await createAdminClient().from('profiles').select('*').eq('id', viewer.id).single();
    d = { country: data?.country ?? '', phone: data?.phone ?? '', company: data?.company ?? '' };
  }
  return (
    <BuyerShell viewer={viewer} active="account" title="Account & security" subtitle="Profile, details for invoices, sign-in safety and your data">
      <div className="g-grid2">
        <GlassCard as="section">
          <h2>Your name</h2>
          <div style={{ marginTop: 12 }}>
            <ProfileForm name={viewer?.name ?? ''} />
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Details for invoices and domains</h2>
          <p className="g-tag" style={{ marginTop: 4 }}>
            Domains are registered with these details. Sellers never see your phone or email.
          </p>
          <div style={{ marginTop: 12 }}>
            <DetailsForm {...d} />
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Sign-in safety</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Change your password, or link another way to sign in.
          </p>
          <div className="g-row" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <Button variant="ghost" href="/account/sign-in">
              Sign-in methods
            </Button>
            <Button variant="ghost" href="/signin?mode=forgot">
              Change password
            </Button>
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Your data</h2>
          <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
            Download a copy of your data, or ask us to delete your account.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button variant="ghost" href="/account/privacy">
              Your data
            </Button>
          </div>
        </GlassCard>
        {viewer && (
          <GlassCard as="section">
            <h2>Selling</h2>
            <p className="g-muted" style={{ marginTop: 8, fontSize: 14 }}>
              {viewer.role === 'seller'
                ? 'Your account sells too. Seller pages ask for your authenticator code.'
                : 'Sell your own websites from this account and keep buying as before. Seller pages ask you to set up an authenticator code.'}
            </p>
            <div style={{ marginTop: 14 }}>
              {viewer.role === 'seller' ? (
                <Button variant="ghost" href="/dashboard/seller">
                  Seller dashboard
                </Button>
              ) : (
                <SellSwitch />
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </BuyerShell>
  );
}
