import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { legacyPublic } from '@/lib/legacy';
import { publicProductPath } from '@/lib/seo/hubStore';
import ProductView, { productMetadata } from './ProductView';

/* Seller listings depend on who is asking (a listing in review is private), so this page renders per request. */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

/* A product's public address is /templates/<category>/<product>. The old /product/<product> address sends visitors there (301); a product that is in no
   category has no public page. A test server with the old public site (NEXT_PUBLIC_LEGACY_PUBLIC=1) shows it here as before. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return legacyPublic() ? productMetadata(id) : { title: 'Not found', robots: { index: false } };
}

export default async function Product({ params }: Props) {
  const { id } = await params;
  if (legacyPublic()) return <ProductView id={id} />;
  const to = await publicProductPath(id);
  if (to) permanentRedirect(to);
  notFound();
}
