import { buyerBadges } from '@/lib/glass/buyer';
import { DashboardShell } from './DashboardShell';

/* The buyer dashboard's shell with its live menu counts. A server component, so each page only says which item it is. */
export async function BuyerShell({
  viewer,
  active,
  title,
  subtitle,
  actions,
  children,
}: {
  viewer: { id: string; name: string; role: string } | null;
  active: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const counts = viewer ? await buyerBadges(viewer.id) : { badges: {}, unread: 0 };
  return (
    <DashboardShell
      role="buyer"
      active={active}
      title={title}
      subtitle={subtitle}
      actions={actions}
      name={viewer?.name}
      signedIn={!!viewer}
      viewerRole={viewer?.role === 'admin' ? 'admin' : undefined}
      badges={counts.badges}
      unread={counts.unread}
    >
      {viewer ? children : <p className="g-muted">The dashboard needs an account. There are no accounts in demo mode.</p>}
    </DashboardShell>
  );
}
