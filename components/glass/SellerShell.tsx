import Link from 'next/link';
import { sellerBadges } from '@/lib/glass/seller';
import { DashboardShell } from './DashboardShell';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
/* The seller dashboard's shell: live menu counts, the public store link and the way back to buying (one account buys and sells, owner 2026-11-07). */
export async function SellerShell({
  viewer,
  active,
  title,
  subtitle,
  actions,
  handle,
  file,
  head,
  children,
}: {
  viewer: { id: string; name: string; role: string } | null;
  active: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  handle?: string;
  file?: string;
  head?: boolean;
  children: React.ReactNode;
}) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const counts = viewer ? await sellerBadges(viewer.id) : { badges: {}, unread: 0 };
  return (
    <DashboardShell
      role="seller"
      file={file}
      head={head}
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
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            <T s={'Your public store'} />
          </div>
          <div className="tag">{handle ? `sellonbay.com/sellers/${handle}` : tx('Choose your store name in Store & analytics')}</div>
          <Link className="btn sm ghost" href={handle ? `/sellers/${handle}` : '/dashboard/seller/store'} prefetch={false} style={{ marginTop: 10 }}>
            {handle ? tx('View store') : tx('Set up store')}
          </Link>{' '}
          <Link className="tag" href="/dashboard/buyer" prefetch={false} style={{ display: 'block', marginTop: 8 }}>
            <T s={'Switch to buying'} />
          </Link>
        </>
      }
    >
      {viewer ? (
        children
      ) : (
        <p className="muted">
          <T s={'The dashboard needs an account. There are no accounts in demo mode.'} />
        </p>
      )}
    </DashboardShell>
  );
}
