import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { ReportsPanel } from '@/components/ReportsPanel';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Sales reports', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* Finance (and Super) export all sales as PDFs. Other admin permissions have no financial exports (Blueprint 8.2). */
export default async function AdminReports() {
  const viewer = await requireViewer({ path: '/dashboard/admin/reports', roles: ['admin'], scope: 'finance' });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-reports" title="Sales reports">
      <ReportsPanel me={viewer?.id ?? 'demo-admin'} scope="admin" />
    </DashShell>
  );
}
