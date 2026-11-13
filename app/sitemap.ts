import type { MetadataRoute } from 'next';
import { isPublicPath, liveLanguages } from '@/lib/i18n/config';
import { alternateLanguages } from '@/lib/i18n/seo';
import { languageSettings } from '@/lib/i18n/settingsRead';
import { SITE_URL } from '@/lib/site';
import { sitemapPlan } from '@/lib/seo/sitemapPlan';
import { isStaging } from '@/lib/stage';

// Read on each request, so new listings, posts and admin publish changes appear without a new build.
export const dynamic = 'force-dynamic';

/*
 * Built from lib/seo/sitemapPlan.ts: published, indexable, switched-on pages only, with real modification dates where known. Each public page
 * also lists its address in every live language (lib/i18n, owner 2026-11-12); a draft language is never listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (isStaging()) return []; // staging lists nothing (lib/stage.ts)
  const live = liveLanguages(await languageSettings());
  return (await sitemapPlan()).map((e) => {
    const path = e.url.startsWith(SITE_URL) ? e.url.slice(SITE_URL.length) || '/' : '';
    const languages = path && isPublicPath(path.split('?')[0]) && !path.includes('?') ? alternateLanguages(path, live) : {};
    return {
      url: e.url,
      changeFrequency: e.changeFrequency,
      ...(e.lastModified ? { lastModified: e.lastModified } : {}),
      ...(Object.keys(languages).length ? { alternates: { languages } } : {}),
    };
  });
}
