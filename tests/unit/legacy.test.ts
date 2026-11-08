import { describe, expect, it } from 'vitest';
import { isRetired, isRetiredApi } from '@/lib/legacy';
import { publicationGate, sitemapPlan } from '@/lib/seo/sitemapPlan';

describe('the retired public site', () => {
  it('retires the old pages and public APIs, and never a working or legal route', () => {
    for (const p of [
      '/browse',
      '/apps/android',
      '/apps/digital',
      '/categories',
      '/developers',
      '/developers/join',
      '/developers/x/hire',
      '/find',
      '/tools/site-ideas',
      '/welcome',
      '/explore',
      '/guest',
      '/api/domains',
      '/api/tools/site-ideas',
      '/api/developers',
      '/api/hire',
    ])
      expect(isRetired(p), p).toBe(true);
    for (const p of [
      '/',
      '/templates/saas',
      '/templates/saas/a-product',
      '/terms',
      '/privacy',
      '/refunds',
      '/login',
      '/checkout',
      '/pay/1',
      '/orders/1',
      '/dashboard/admin',
      '/sell',
      '/sell/new',
      '/faq',
      '/how-it-works',
      '/search',
      '/api/search',
      '/api/health',
      '/api/orders/1/accept',
      '/browsers',
      '/applications',
    ])
      expect(isRetired(p), p).toBe(false);
    expect(isRetiredApi('/api/domains')).toBe(true);
    expect(isRetiredApi('/browse')).toBe(false);
  });
});

describe('the 25-address public sitemap', () => {
  it('never invents an address: with no real products it holds the home page and says what is missing', async () => {
    const plan = await sitemapPlan();
    expect(plan.map((e) => e.path)).toEqual(['/', '/websites', '/domains', '/sellers', '/sell', '/buyer-protection', '/help', '/guides']);
    const g = await publicationGate();
    expect(g).toMatchObject({ target: 25, ready: 0, complete: false });
    expect(g.categories.map((c) => [c.slug, c.have, c.need])).toEqual([
      ['ecommerce', 0, 3],
      ['saas', 0, 3],
      ['business', 0, 3],
      ['portfolio', 0, 3],
      ['industry', 0, 3],
    ]);
  });
});
