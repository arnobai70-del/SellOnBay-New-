import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MaintenanceNotice } from '@/components/MaintenanceNotice';
import { isModuleKey } from '@/lib/maintenance/config';
import { closedRow, defaultMessage, shownMessage } from '@/lib/maintenance/state';

export const metadata: Metadata = { title: 'Back soon', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';

/* proxy.ts shows this (with status 503) in place of a page whose module is in maintenance. Opened directly, it says the same thing. */
export default async function Maintenance({ params }: { params: Promise<{ module: string }> }) {
  const { module: key } = await params;
  if (!isModuleKey(key)) notFound();
  const row = await closedRow(key);
  return <MaintenanceNotice module={key} message={row ? shownMessage(row) : defaultMessage(key)} until={row?.endAt ?? null} />;
}
