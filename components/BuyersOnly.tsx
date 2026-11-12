import Link from 'next/link';
import { BUYERS_ONLY } from '@/lib/accounts';

import { T } from '@/components/i18n/T';
/* Shown to a signed-in seller or admin who opens checkout or a hire form: each role has its own account, and only buyers buy. */
export function BuyersOnly({ role }: { role: string }) {
  return (
    <div className="wrap" style={{ padding: '64px 0 96px', maxWidth: 640 }}>
      <h1>
        <T s={'Buying needs a buyer account'} />
      </h1>
      <p className="muted">{BUYERS_ONLY}</p>
      <p className="muted">
        <T s={'You are signed in with a {role} account.'} v={{ role }} />
      </p>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <Link className="btn" href={`/dashboard/${role}`}>
          <T s={'Go to your dashboard'} />
        </Link>
        <Link className="btn ghost" href="/">
          <T s={'Keep browsing'} />
        </Link>
      </p>
    </div>
  );
}
