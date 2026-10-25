import { describe, expect, it } from 'vitest';
import { HUBS } from '@/lib/seo/hubs';
import { WEB_CATS, isWebCat, webCatLabel } from '@/lib/webCategories';
import { hubOf, type Allocation } from '@/lib/seo/hubStore';

const none: Allocation = { assign: {}, limits: {}, slugs: {} };

describe('website categories', () => {
  it('offers the five template categories, in the top bar order', () => {
    expect(WEB_CATS).toEqual(HUBS.map((h) => h.name));
    expect(WEB_CATS).toHaveLength(5);
  });
  it('still accepts older values and shows them as the new category they belong to', () => {
    expect(isWebCat('Restaurants')).toBe(true);
    expect(isWebCat('Nonsense')).toBe(false);
    expect(webCatLabel('Stores')).toBe('E-commerce Templates');
    expect(webCatLabel('Restaurants')).toBe('Industry Website Templates');
    expect(webCatLabel('Portfolio & Agency Templates')).toBe('Portfolio & Agency Templates');
  });
  it('puts every offered category in its own hub', () => {
    for (const h of HUBS) expect(hubOf({ id: 'p', cat: h.name, platform: 'web' }, none)?.slug).toBe(h.slug);
  });
});
