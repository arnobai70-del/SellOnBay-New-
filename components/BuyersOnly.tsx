import Link from 'next/link';
import { BUYERS_ONLY } from '@/lib/accounts';

/* Shown to a signed-in seller or admin who opens checkout or a hire form: each role has its own account, and only buyers buy. */
export function BuyersOnly({ role }: { role: string }) {
  return (
    <div className="wrap" style={{ padding: '64px 0 96px', maxWidth: 640 }}>
      <h1>Buying needs a buyer account</h1>
      <p className="lead">{BUYERS_ONLY}</p>
      <p className="muted">You are signed in with a {role} account.</p>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <Link className="btn btn-blue" href={`/dashboard/${role}`}>
          Go to your dashboard
        </Link>
        <Link className="btn btn-line" href="/">
          Keep browsing
        </Link>
      </p>
    </div>
  );
}
