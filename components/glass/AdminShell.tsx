import Link from 'next/link';
import { adminBadges } from '@/lib/glass/admin';
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
  const counts = await adminBadges();
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
