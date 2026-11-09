import Link from 'next/link';
import { quickStatus } from '@/lib/admin/system';
import { adminBadges } from '@/lib/glass/admin';
import { getSettings } from '@/lib/settings';
import { DashboardShell } from './DashboardShell';

const HEALTH = { ok: ['#3F8F77', 'All systems normal'], warn: ['#C9962E', 'Something needs a look'], bad: ['#C2553F', 'Something is wrong'], off: ['#A9B8C0', 'Not set up'] } as const;

/* The admin pages' shell (design-reference/admin*.html): live counts on the menu and the system health card at the foot of the sidebar. */
export async function AdminShell({
  viewer,
  active,
  file,
  title,
  subtitle,
  actions,
  head,
  children,
}: {
  viewer: { id: string; name: string; role: string } | null;
  active: string;
  file?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  head?: boolean;
  children: React.ReactNode;
}) {
  const [counts, settings, status] = await Promise.all([adminBadges(), getSettings(), quickStatus().catch(() => 'off' as const)]);
  const [dot, text] = HEALTH[status];
  return (
    <DashboardShell
      role="admin"
      file={file ?? 'admin-settings'}
      active={active}
      title={title}
      subtitle={subtitle}
      actions={actions}
      head={head}
      name={viewer?.name}
      signedIn={!!viewer}
      viewerRole="admin"
      badges={counts}
      hideCta={settings.paymentsMode === 'beta_free'} // the cash desk is closed in the free beta (owner, 2026-11-08)
      sideCard={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
            {text}
          </div>
          <Link href="/admin/system" className="tag" style={{ display: 'block' }} prefetch={false}>
            View system health
          </Link>
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
