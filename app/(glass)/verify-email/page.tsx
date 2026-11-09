import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFrame } from '@/components/glass/PublicFrame';

export const metadata: Metadata = { title: 'Check your inbox', robots: { index: false } };

/* The "Verify email" card of design-reference/account-access.html. Supabase confirms an email with a link, not a typed code, so this screen says that. */
export default function VerifyEmail() {
  return (
    <PublicFrame file="account-access">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 20px 0' }}>
        <section className="glass ac" style={{ width: '100%', maxWidth: 460 }}>
          <span className="lab">Verify email</span>
          <h1 style={{ fontSize: 30, fontWeight: 400 }}>Check your inbox</h1>
          <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            We sent you a link to verify your email. Verifying protects your orders and domains. It can take a minute, and it may be in your spam folder.
          </p>
          <Link className="btn ghost" href="/signin" prefetch={false}>
            Back to sign in
          </Link>
        </section>
      </div>
    </PublicFrame>
  );
}
