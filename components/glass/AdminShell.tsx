import Link from 'next/link';
import { quickStatus } from '@/lib/admin/system';
import { adminBadges } from '@/lib/glass/admin';
import { getSettings } from '@/lib/settings';
import { DashboardShell } from './DashboardShell';

import { T } from '@/components/i18n/T';
import type { Tx } from '@/lib/i18n/tx';
import { getI18n } from '@/lib/i18n/server';
const HEALTH = (tx: Tx) =>
  ({ ok: ['#3F8F77', tx('All systems normal')], warn: ['#C9962E', tx('Something needs a look')], bad: ['#C2553F', tx('Something is wrong')], off: ['#A9B8C0', tx('Not set up')] }) as const;

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
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [counts, settings, status] = await Promise.all([adminBadges(), getSettings(), quickStatus().catch(() => 'off' as const)]);
  const [dot, text] = HEALTH(tx)[status];
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
            <T s={'View system health'} />
          </Link>
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
