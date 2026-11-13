import type { Metadata } from 'next';
import { DashShell } from '@/components/DashShell';
import { ReportsPanel } from '@/components/ReportsPanel';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Sales reports'), robots: { index: false } });
export const dynamic = 'force-dynamic';

/* A seller's own sales as PDF: date, product, quoted amount, commission, plan, net and status. No buyer personal data. */
export default async function SellerReports() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller/reports', roles: ['seller'] });
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller-reports" title={tx('Sales reports')}>
      {viewer ? (
        <ReportsPanel me={viewer.id} scope="seller" />
      ) : (
        <p className="muted">
          <T s={'Reports need an account. There are none in demo mode.'} />
        </p>
      )}
    </DashShell>
  );
}
