import { PLAN_KEEP_TEXT } from '@/lib/config';
import { SellSwitch } from './SellerForms';
import { buyerBadges } from '@/lib/glass/buyer';
import { DashboardShell } from './DashboardShell';

import { T } from '@/components/i18n/T';
/* The buyer dashboard's shell with its live menu counts. A server component, so each page only says which item it is. */
export async function BuyerShell({
  viewer,
  active,
  title,
  subtitle,
  actions,
  file,
  head,
  children,
}: {
  viewer: { id: string; name: string; role: string } | null;
  active: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  file?: string;
  head?: boolean;
  children: React.ReactNode;
}) {
  const counts = viewer ? await buyerBadges(viewer.id) : { badges: {}, unread: 0 };
  return (
    <DashboardShell
      role="buyer"
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
            <T s={'Want to sell?'} />
          </div>
          <div className="tag">
            <T s={'Keep {PLAN_KEEP_TEXT} of every sale'} v={{ PLAN_KEEP_TEXT }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <SellSwitch />
          </div>
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
