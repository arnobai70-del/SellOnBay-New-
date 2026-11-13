import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { platformOf } from '@/lib/apps';
import { GlassPage } from '@/components/glass/GlassPage';
import { PreviewShell } from '@/components/PreviewShell';
import { visibleProduct } from '@/lib/catalog';

import { getI18n } from '@/lib/i18n/server';
type Props = { params: Promise<{ id: string }> };

export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Preview'), robots: { index: false, follow: false } });

export default async function Preview({ params }: Props) {
  const { id } = await params;
  const found = await visibleProduct(id);
  if (!found) notFound();
  if (platformOf(found.product) !== 'web') redirect(`/product/${id}`); // apps have no full-page preview
  return (
    <GlassPage file="website">
      <PreviewShell p={found.product} />
    </GlassPage>
  );
}
