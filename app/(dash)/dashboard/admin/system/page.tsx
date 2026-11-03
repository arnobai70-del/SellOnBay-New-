import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { SystemLive } from '@/components/admin/SystemLive';
import { systemSnapshot } from '@/lib/admin/system';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Server and system', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Read only: how the site, the database, the cache, email, payments and the scheduled jobs are doing. Super Admin with the authenticator code. */
export default async function SystemPage() {
  const viewer = await requireViewer({ path: '/dashboard/admin/system', roles: ['admin'], scope: 'super' });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-system" title="Server and system">
      <SystemLive initial={await systemSnapshot()} />
    </DashShell>
  );
}
