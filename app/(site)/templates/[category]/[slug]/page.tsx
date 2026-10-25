import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import ProductView, { productMetadata } from '../../../product/[id]/ProductView';
import { SITE_URL } from '@/lib/site';
import { allocation, hubByEnding, hubProductPath, hubPublicPath, publicProductPath, hubView } from '@/lib/seo/hubStore';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string; slug: string }> };

/* Is this product one of the (at most four) public products of this category? */
async function resolve(category: string, slug: string) {
  const hub = await hubByEnding(category);
  if (!hub) return null;
  const v = await hubView(hub);
  if (!v.products.some((p) => p.id === slug)) return { hub, there: false as const };
  const a = await allocation();
  return { hub, there: true as const, path: hubProductPath(hub, a, slug), home: hubPublicPath(hub, a), name: hub.name };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const r = await resolve(category, slug);
  if (!r || !r.there) return { title: 'Not found', robots: { index: false } };
  return productMetadata(slug, r.path);
}

export default async function Page({ params }: Props) {
  const { category, slug } = await params;
  const r = await resolve(category, slug);
  if (!r) notFound();
  if (!r.there) {
    // In another category (or renamed address): send the visitor to the right address.
    const to = await publicProductPath(slug);
    if (to) permanentRedirect(to);
    notFound();
  }
  return (
    <ProductView
      id={slug}
      canonical={r.path}
      crumbs={[
        { name: 'Home', url: SITE_URL + '/' },
        { name: r.name, url: SITE_URL + r.home },
      ]}
    />
  );
}
