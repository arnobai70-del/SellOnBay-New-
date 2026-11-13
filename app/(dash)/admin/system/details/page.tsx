import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { SystemLive } from '@/components/admin/SystemLive';
import { systemSnapshot } from '@/lib/admin/system';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Server and system'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Read only: how the site, the database, the cache, email, payments and the scheduled jobs are doing. Super Admin with the authenticator code. */
export default async function SystemPage() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/system/details', roles: ['admin'], scope: 'super' });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-system" title={tx('Server and system')}>
      <SystemLive initial={await systemSnapshot()} />
    </DashShell>
  );
}
