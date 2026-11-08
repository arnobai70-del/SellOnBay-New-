import Link from 'next/link';
import { adminBadges } from '@/lib/glass/admin';
import { getSettings } from '@/lib/settings';
import { DashboardShell } from './DashboardShell';

/* The admin pages' shell: live counts on the menu, and the way to the older full tools while they still hold actions not moved yet. */
export async function AdminShell({
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
  const [counts, settings] = await Promise.all([adminBadges(), getSettings()]);
  return (
    <DashboardShell
      role="admin"
      active={active}
      title={title}
      subtitle={subtitle}
      actions={actions}
      name={viewer?.name}
      signedIn={!!viewer}
      viewerRole="admin"
      badges={counts}
      hideCta={settings.paymentsMode === 'beta_free'} // the cash desk is closed in the free beta (owner, 2026-11-08)
      sideCard={
        <>
          <div style={{ fontWeight: 500 }}>All admin tools</div>
          <div className="g-tag">Every older tool stays open while its page moves.</div>
          <div style={{ marginTop: 8 }}>
            <Link href="/dashboard/admin">Open full tools</Link>
          </div>
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
