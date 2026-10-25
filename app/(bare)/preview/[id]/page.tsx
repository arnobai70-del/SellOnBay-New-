import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { platformOf } from '@/lib/apps';
import { PreviewShell } from '@/components/PreviewShell';
import { visibleProduct } from '@/lib/catalog';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Preview', robots: { index: false, follow: false } };

export default async function Preview({ params }: Props) {
  const { id } = await params;
  const found = await visibleProduct(id);
  if (!found) notFound();
  if (platformOf(found.product) !== 'web') redirect(`/product/${id}`); // apps have no full-page preview
  return <PreviewShell p={found.product} />;
}
