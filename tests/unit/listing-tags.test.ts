import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/config';
import { cleanTags } from '@/lib/listingTags';

describe('listing tags (lib/listingTags.ts)', () => {
  it('splits on commas and new lines, lower-cases, tidies and drops repeats', () => {
    expect(cleanTags(' Restaurant,  online   booking\nrestaurant, ')).toEqual({ ok: true, tags: ['restaurant', 'online booking'] });
  });
  it('an empty field is no tags', () => {
    expect(cleanTags('  ,  ')).toEqual({ ok: true, tags: [] });
  });
  it('keeps the count and length limits from the config', () => {
    const many = Array.from({ length: CONFIG.listing.maxTags + 1 }, (_, i) => `tag${i}`).join(',');
    expect(cleanTags(many).ok).toBe(false);
    expect(cleanTags('a').ok).toBe(false);
    expect(cleanTags('x'.repeat(CONFIG.listing.tagMaxChars + 1)).ok).toBe(false);
  });
  it('refuses symbols, links and contact details', () => {
    expect(cleanTags('<script>').ok).toBe(false);
    expect(cleanTags('www.example.com').ok).toBe(false);
    expect(cleanTags('me@example.com').ok).toBe(false);
  });
  it('allows words people search for, such as e-commerce and next.js', () => {
    expect(cleanTags('e-commerce, next.js, b2b & saas')).toEqual({ ok: true, tags: ['e-commerce', 'next.js', 'b2b & saas'] });
  });
});
