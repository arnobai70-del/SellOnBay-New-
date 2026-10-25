import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { legacyPublic } from '@/lib/legacy';
import { PageExtras } from '@/components/PageExtras';
import { CategoryPage } from '@/components/CategoryPage';
import { categoryFor, MIN_PRODUCTS } from '@/lib/seo/categories';
import { publishedFaqs } from '@/lib/seo/controls';
import { pageControls } from '@/lib/seo/controlStore';
import { HUBS, hubPath } from '@/lib/seo/hubs';
import { allocation, hubByEnding, hubProductPath, hubPublicPath, hubPublicSlug, hubView } from '@/lib/seo/hubStore';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { categoryPages, productsIn } from '@/lib/seo/pages';

export const dynamic = 'force-dynamic';
const GROUP = 'templates' as const;

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const slug = (await params).category;
  const hub = await hubByEnding(slug);
  if (hub?.slug === 'ecommerce') return { robots: { index: false } }; // sent to the home page
  if (hub) {
    // A hub page always opens, but stays out of search until it has enough real listings (no thin page is submitted).
    const { indexable } = await hubView(hub);
    return pageMetadata(hubPath(hub), { alternates: { canonical: hubPublicPath(hub, await allocation()) }, ...(indexable ? {} : { robots: { index: false, follow: true } }) });
  }
  const c = legacyPublic() ? categoryFor(GROUP, slug) : undefined;
  if (!c) return { robots: { index: false } };
  return { title: c.title, description: c.description, alternates: { canonical: `/${GROUP}/${c.slug}` }, openGraph: { title: c.title, description: c.description } };
}

/* The five template hubs (lib/seo/hubs.ts) open at once; the digital categories only with at least three real products, so there are no thin pages. */
export default async function Page({ params }: { params: Promise<{ category: string }> }) {
  const slug = (await params).category;
  const hub = await hubByEnding(slug);
  if (hub?.slug === 'ecommerce') permanentRedirect('/'); // the E-commerce category is the home page
  if (hub) {
    await pageMetadata(hubPath(hub)); // a draft or archived hub is a real 404 here too
    const v = await hubView(hub);
    const w = await pageWords(hubPath(hub));
    // The admin's heading and intro replace the built-in ones; empty boxes keep them.
    const a = await allocation();
    const shown = { ...hub, slug: hubPublicSlug(hub, a), h1: w.heading, intro: w.intro && w.intro !== hub.intro.join(' ') ? [w.intro] : hub.intro };
    const saved = publishedFaqs(await pageControls(hubPath(hub)));
    return (
      <>
        <CategoryPage
          c={shown}
          products={v.products}
          productHref={(p) => hubProductPath(hub, a, p.id)}
          others={HUBS.filter((x) => x.slug !== hub.slug).map((x) => ({ ...x, slug: hubPublicSlug(x, a) }))}
          faq={saved.length ? [] : hub.faq}
        />
        <PageExtras path={hubPath(hub)} urlPath={hubPublicPath(hub, a)} name={hub.h1} description={hub.description} collection />
      </>
    );
  }
  const c = legacyPublic() ? categoryFor(GROUP, slug) : undefined; // the old digital categories are part of the retired site
  if (!c) notFound();
  const products = await productsIn(c);
  if (products.length < MIN_PRODUCTS) notFound();
  const others = (await categoryPages()).filter((x) => x.copy.group === GROUP && x.copy.slug !== c.slug).map((x) => x.copy);
  return <CategoryPage c={c} products={products} others={others} />;
}
