import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MaintenanceNotice } from '@/components/MaintenanceNotice';
import { isModuleKey } from '@/lib/maintenance/config';
import { closedRow, defaultMessage, shownMessage } from '@/lib/maintenance/state';

import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Back soon'), robots: { index: false, follow: true } });
export const dynamic = 'force-dynamic';

/* Where requireViewer sends a closed module's page (lib/supabase/viewer.ts); proxy.ts answers its own 503 notice (maintenancePageResponse). */
export default async function Maintenance({ params }: { params: Promise<{ module: string }> }) {
  const { module: key } = await params;
  if (!isModuleKey(key)) notFound();
  const row = await closedRow(key);
  return <MaintenanceNotice module={key} message={row ? shownMessage(row) : defaultMessage(key)} until={row?.endAt ?? null} />;
}
