import type { Metadata } from 'next';
import { Button } from '@/components/glass/Button';
import { DetailsForm } from '@/components/glass/DetailsForm';
import { GlassCard } from '@/components/glass/GlassCard';
import { SellerShell } from '@/components/glass/SellerShell';
import { ProfileForm } from '@/components/ProfileForm';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Account and security', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SellerAccount() {
  const viewer = await requireViewer({ path: '/dashboard/seller/account', roles: ['seller', 'admin'] });
  let d = { country: '', phone: '', company: '' };
  if (viewer && supabaseConfigured) {
    const { data } = await createAdminClient().from('profiles').select('*').eq('id', viewer.id).single();
    d = { country: data?.country ?? '', phone: data?.phone ?? '', company: data?.company ?? '' };
  }
  return (
    <SellerShell viewer={viewer} active="account" title="Account & security" subtitle="Your details, the authenticator code and your data">
      <div className="grid2">
        <GlassCard as="section">
          <h2>Your name</h2>
          <div style={{ marginTop: 12 }}>
            <ProfileForm name={viewer?.name ?? ''} />
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Country and contact details</h2>
          <p className="tag" style={{ marginTop: 4 }}>
            Your country decides which payout methods you can use. Buyers never see your phone or email.
          </p>
          <div style={{ marginTop: 12 }}>
            <DetailsForm {...d} />
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Sign-in safety</h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Seller pages always ask for your authenticator code, so a password alone never reaches your listings or payouts.
          </p>
          <div className="row" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <Button variant="ghost" href="/account/sign-in">
              Sign-in methods
            </Button>
            <Button variant="ghost" href="/signin?mode=forgot">
              Change password
            </Button>
          </div>
        </GlassCard>
        <GlassCard as="section">
          <h2>Buying</h2>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Your account can buy too. Your purchases are on the buyer dashboard.
          </p>
          <div className="row" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <Button variant="ghost" href="/dashboard/buyer">
              Buyer dashboard
            </Button>
            <Button variant="ghost" href="/account/privacy">
              Your data
            </Button>
          </div>
        </GlassCard>
      </div>
    </SellerShell>
  );
}
