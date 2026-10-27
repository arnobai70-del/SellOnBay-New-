import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { ReportsPanel } from '@/components/ReportsPanel';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Sales reports', robots: { index: false } };
export const dynamic = 'force-dynamic';

/* A seller's own sales as PDF: date, product, quoted amount, commission, plan, net and status. No buyer personal data. */
export default async function SellerReports() {
  const viewer = await requireViewer({ path: '/dashboard/seller/reports', roles: ['seller'] });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller-reports" title="Sales reports">
      {viewer ? <ReportsPanel me={viewer.id} scope="seller" /> : <p className="muted">Reports need an account. There are none in demo mode.</p>}
    </DashShell>
  );
}
