import type { MetadataRoute } from 'next';
import { robotsDisallow } from '@/lib/seo/robotsRules';
import { robotsExtra } from '@/lib/seo/robotsStore';
import { SITE_URL } from '@/lib/site';
import { isStaging } from '@/lib/stage';

// Read on each request: an admin can add paths to keep crawlers out of (SEO and CMS > robots.txt). Pages are kept out of search with noindex, not here.
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  if (isStaging()) return { rules: [{ userAgent: '*', disallow: '/' }] }; // staging: nothing, and no sitemap (lib/stage.ts)
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: robotsDisallow(await robotsExtra()) }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
