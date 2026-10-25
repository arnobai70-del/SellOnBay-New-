import { describe, expect, it } from 'vitest';
import { REVIEW_HOURS } from '@/lib/config';
import { SHELF_GUIDE, lowerShelf, relatedSearches } from '@/lib/shelfGuide';

describe('the shelf guide', () => {
  it('has three answers for every shelf and says how long the buyer has to check, from the config', () => {
    for (const [pl, g] of Object.entries(SHELF_GUIDE)) {
      expect(g.what.length, pl).toBeGreaterThan(30);
      expect(g.who.length, pl).toBeGreaterThan(30);
      expect(g.included.join(' '), pl).toContain(`${REVIEW_HOURS} hours`);
    }
  });
  it('links searches on the other shelves only, inside the site', () => {
    const links = relatedSearches('web');
    expect(links.length).toBeGreaterThan(5);
    for (const [, href] of links) {
      expect(href).toMatch(/^\/apps\/(android|ios|web|desktop|digital)\?q=/);
    }
  });
  it('writes shelf names in sentence case without breaking iPhone', () => {
    expect(lowerShelf('android')).toBe('android apps');
    expect(lowerShelf('ios')).toBe('iPhone & iPad apps');
  });
});
