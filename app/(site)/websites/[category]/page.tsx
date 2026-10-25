import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryPage } from '@/components/CategoryPage';
import { categoryFor, MIN_PRODUCTS } from '@/lib/seo/categories';
import { categoryPages, productsIn } from '@/lib/seo/pages';

export const dynamic = 'force-dynamic';
const GROUP = 'websites' as const;

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const c = categoryFor(GROUP, (await params).category);
  if (!c) return {};
  return { title: c.title, description: c.description, alternates: { canonical: `/${GROUP}/${c.slug}` }, openGraph: { title: c.title, description: c.description } };
}

/* Only categories with at least three real products have a page, so there are no thin pages. */
export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const c = categoryFor(GROUP, (await params).category);
  if (!c) notFound();
  const products = await productsIn(c);
  if (products.length < MIN_PRODUCTS) notFound();
  const others = (await categoryPages()).filter((x) => x.copy.group === GROUP && x.copy.slug !== c.slug).map((x) => x.copy);
  return <CategoryPage c={c} products={products} others={others} />;
}
