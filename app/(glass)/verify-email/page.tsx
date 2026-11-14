import { TopBand } from '@/components/glass/TopBand';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFrame } from '@/components/glass/PublicFrame';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Check your inbox'), robots: { index: false } });

/* The "Verify email" card of design-reference/account-access.html. Supabase confirms an email with a link, not a typed code, so this screen says that. */
export default function VerifyEmail() {
  return (
    <PublicFrame file="account-access">
      <TopBand
        eyebrow={<T s={'Verify email'} />}
        title={<T s={'Check your inbox'} />}
        intro={<T s={'We sent you a link to verify your email. Verifying protects your orders and domains. It can take a minute, and it may be in your spam folder.'} />}
      >
        <Link className="btn ghost" href="/signin" prefetch={false} style={{ alignSelf: 'flex-start' }}>
          <T s={'Back to sign in'} />
        </Link>
      </TopBand>
    </PublicFrame>
  );
}
