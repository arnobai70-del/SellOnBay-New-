import type { MetadataRoute } from 'next';
import { sitemapPlan } from '@/lib/seo/sitemapPlan';

// Read on each request, so new listings, posts and admin publish changes appear without a new build.
export const dynamic = 'force-dynamic';

/* Built from lib/seo/sitemapPlan.ts: published, indexable, switched-on pages only, with real modification dates where known. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return (await sitemapPlan()).map((e) => ({ url: e.url, changeFrequency: e.changeFrequency, ...(e.lastModified ? { lastModified: e.lastModified } : {}) }));
}
