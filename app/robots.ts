import type { MetadataRoute } from 'next';
import { robotsDisallow } from '@/lib/seo/robotsRules';
import { robotsExtra } from '@/lib/seo/robotsStore';
import { SITE_URL } from '@/lib/site';

// Read on each request: an admin can add paths to keep crawlers out of (SEO and CMS > robots.txt). Pages are kept out of search with noindex, not here.
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: robotsDisallow(await robotsExtra()) }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
