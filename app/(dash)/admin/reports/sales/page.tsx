import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { ReportsPanel } from '@/components/ReportsPanel';
import { requireViewer } from '@/lib/supabase/viewer';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Sales reports'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* Finance (and Super) export all sales as PDFs. Other admin permissions have no financial exports (Blueprint 8.2). */
export default async function AdminReports() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/reports/sales', roles: ['admin'], scope: 'finance' });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-reports" title={tx('Sales reports')}>
      <ReportsPanel me={viewer?.id ?? 'demo-admin'} scope="admin" />
    </DashShell>
  );
}
