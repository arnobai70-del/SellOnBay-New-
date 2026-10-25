import { describe, expect, it } from 'vitest';
import { APPS } from '@/lib/apps';
import { CONFIG, DAY_MS } from '@/lib/config';
import { missingForReview, type ReviewInput } from '@/lib/listingRules';
import { endsAt, infoOf, isActive, periodText, promisedDays } from '@/lib/productInfo';

const base: ReviewInput = {
  kind: 'digital',
  name: 'Lead Capture',
  category: 'Scripts',
  desc: 'A script that captures leads.',
  includes: ['Script'],
  demoLink: 'https://example.com/demo',
  hasZip: false,
  shots: 3,
  codeUrl: 'https://example.com/files',
  clean: true,
};

describe('what a digital listing must say before review', () => {
  it('software (plugins, scripts, automations, chatbots) must say what it needs to run; design kits and templates need not', () => {
    expect(missingForReview(base)).toEqual(['what it needs to run (system requirements)']);
    expect(missingForReview({ ...base, requirements: '   ' })).toHaveLength(1);
    expect(missingForReview({ ...base, requirements: 'Python 3.10' })).toEqual([]);
    expect(missingForReview({ ...base, category: 'Figma kits', demoLink: '' })).toEqual([]);
  });
  it('a documentation link is optional, but if given it must be https', () => {
    const ok = { ...base, requirements: 'Python 3.10' };
    expect(missingForReview({ ...ok, docsUrl: '' })).toEqual([]);
    expect(missingForReview({ ...ok, docsUrl: 'https://docs.example.com/x' })).toEqual([]);
    expect(missingForReview({ ...ok, docsUrl: 'http://docs.example.com/x' })).toEqual(['a documentation link that starts with https']);
    expect(missingForReview({ ...ok, docsUrl: 'javascript:alert(1)' })).toHaveLength(1);
  });
  it('other kinds of product are not asked for it', () => {
    expect(missingForReview({ ...base, kind: 'android', category: 'Fitness', shots: 3 })).toEqual([]);
  });
});

describe('support and update periods', () => {
  it('the choices live in the config and start with none', () => {
    expect(CONFIG.listing.periodDays[0]).toBe(0);
    expect([...CONFIG.listing.periodDays]).toEqual([...CONFIG.listing.periodDays].sort((a, b) => a - b));
  });
  it('are worded plainly and counted from the purchase', () => {
    expect(periodText(0)).toBe('None');
    expect(periodText(90)).toBe('90 days');
    expect(periodText(365)).toBe('1 year');
    const paid = Date.UTC(2026, 9, 1);
    expect(endsAt(paid, 30)).toBe(paid + 30 * DAY_MS);
    expect(endsAt(paid, 0)).toBeNull();
    expect(endsAt(undefined, 30)).toBeNull();
    expect(isActive(paid, 30, paid + 29 * DAY_MS)).toBe(true);
    expect(isActive(paid, 30, paid + 31 * DAY_MS)).toBe(false);
    expect(isActive(paid, 0, paid)).toBe(false);
  });
  it('only digital products have the information, and every digital starter says what it needs', () => {
    const digital = APPS.filter((a) => a.platform === 'digital');
    for (const p of digital) {
      const i = infoOf(p)!;
      expect(i.requirements, p.name).toBeTruthy();
      expect(i.updateDays, p.name).toBe(0); // no starter promises updates: nobody delivers them
    }
    expect(infoOf(APPS.find((a) => a.platform === 'android')!)).toBeNull();
  });
  it('a buyer keeps the period promised when they ordered, or a longer one the seller set later', () => {
    expect(promisedDays(90, 30)).toBe(90); // shortened after the purchase
    expect(promisedDays(30, 90)).toBe(90); // made longer later
    expect(promisedDays(undefined, 30)).toBe(30); // an older order without a kept value
    expect(promisedDays(null, 0)).toBe(0);
  });
});
