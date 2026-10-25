import type { Metadata } from 'next';
import { robotsFor, type PageControls } from './controls';

/*
 * Lays an admin's saved search settings (lib/seo/controls.ts) over a page's own metadata: canonical address, robots, and the share card
 * (Open Graph and X). Used by every kind of page (listed pages, the home page, listings), so they all behave the same. Pure, so it is tested.
 * A page with nothing saved comes back unchanged.
 */
export function applyControls(path: string, m: Metadata, c: PageControls): Metadata {
  const robots = robotsFor(path, c);
  const card = !!(c.ogTitle || c.ogDescription || c.ogImage);
  const image = c.ogImage ? [c.ogImageAlt ? { url: c.ogImage, alt: c.ogImageAlt } : c.ogImage] : undefined;
  const og = m.openGraph as Record<string, unknown> | null | undefined;
  return {
    ...m,
    ...(c.canonical ? { alternates: { ...m.alternates, canonical: c.canonical } } : {}),
    ...(robots ? { robots } : {}),
    ...(card
      ? {
          openGraph: {
            type: 'website',
            ...og,
            ...(c.ogTitle ? { title: c.ogTitle } : {}),
            ...(c.ogDescription ? { description: c.ogDescription } : {}),
            ...(image ? { images: image } : {}),
          } as Metadata['openGraph'],
          twitter: {
            card: c.ogImage ? 'summary_large_image' : 'summary',
            ...(c.ogTitle ? { title: c.ogTitle } : {}),
            ...(c.ogDescription ? { description: c.ogDescription } : {}),
            ...(c.ogImage ? { images: [c.ogImage] } : {}),
          },
        }
      : {}),
  };
}
