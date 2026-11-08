import type { Metadata } from 'next';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';

export const metadata: Metadata = { title: 'Check your inbox', robots: { index: false } };

/* Supabase confirms an email with a link, not a typed code, so this screen says that. */
export default function VerifyEmail() {
  return (
    <div className="g-head" style={{ alignItems: 'center', textAlign: 'center' }}>
      <h1>Check your inbox</h1>
      <GlassCard rise={false} style={{ maxWidth: 480 }}>
        <p className="muted" style={{ fontSize: 14 }}>
          We sent you a link to verify your email. Verifying protects your orders and domains. It can take a minute, and it may be in your spam folder.
        </p>
        <div style={{ marginTop: 14 }}>
          <Button variant="ghost" href="/signin">
            Back to sign in
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
