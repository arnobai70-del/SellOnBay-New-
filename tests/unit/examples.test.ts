import { describe, expect, it } from 'vitest';
import { ALL_PRODUCTS } from '@/lib/apps';
import { PRODUCTS } from '@/lib/data';
import { DEVS } from '@/lib/developers';
import { problemWith, DEFAULTS } from '@/lib/settings';

/* The made-up starter listings and developer profiles must never look like real sales, ratings or reviews. */
describe('example listings and profiles', () => {
  it('every starter product is marked as an example, with no ratings, sales or seller of its own', () => {
    expect(ALL_PRODUCTS.length).toBeGreaterThan(10);
    for (const p of [...PRODUCTS, ...ALL_PRODUCTS]) {
      expect(p.example, p.id).toBe(true);
      expect([p.rating, p.reviews, p.sold], p.id).toEqual([0, 0, 0]);
      expect(p.seller, p.id).toBe('SellOnBay example');
      expect(p.sellerId, p.id).toBeUndefined();
    }
  });
  it('every starter developer is an example, with no ratings, orders or written reviews', () => {
    for (const d of DEVS) {
      expect(d.example, d.id).toBe(true);
      expect([d.rating, d.reviews, d.orders, d.feedback.length], d.id).toEqual([0, 0, 0, 0]);
    }
  });
  it('they are shown by default, and an admin can hide them', () => {
    expect(DEFAULTS.showExamples).toBe(true);
    expect(problemWith({ ...DEFAULTS, showExamples: false })).toBeNull();
  });
});
