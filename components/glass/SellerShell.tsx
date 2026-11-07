import Link from 'next/link';
import { sellerBadges } from '@/lib/glass/seller';
import { DashboardShell } from './DashboardShell';

/* The seller dashboard's shell: live menu counts, the public store link and the way back to buying (one account buys and sells, owner 2026-11-07). */
export async function SellerShell({
  viewer,
  active,
  title,
  subtitle,
  actions,
  handle,
  children,
}: {
  viewer: { id: string; name: string; role: string } | null;
  active: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  handle?: string;
  children: React.ReactNode;
}) {
  const counts = viewer ? await sellerBadges(viewer.id) : { badges: {}, unread: 0 };
  return (
    <DashboardShell
      role="seller"
      active={active}
      title={title}
      subtitle={subtitle}
      actions={actions}
      name={viewer?.name}
      signedIn={!!viewer}
      viewerRole={viewer?.role === 'admin' ? 'admin' : undefined}
      badges={counts.badges}
      unread={counts.unread}
      sideCard={
        <>
          {handle && (
            <>
              <div style={{ fontWeight: 500 }}>Your public store</div>
              <div className="g-tag">sellonbay.com/sellers/{handle}</div>
              <div style={{ marginTop: 8 }}>
                <Link href={`/sellers/${handle}`}>View store</Link>
              </div>
            </>
          )}
          <div style={{ marginTop: 8 }}>
            <Link href="/dashboard/buyer">Switch to buying</Link>
          </div>
        </>
      }
    >
      {viewer ? children : <p className="g-muted">The dashboard needs an account. There are no accounts in demo mode.</p>}
    </DashboardShell>
  );
}
