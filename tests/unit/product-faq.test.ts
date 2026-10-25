import { describe, expect, it } from 'vitest';
import { ALL_PRODUCTS } from '@/lib/apps';
import { PRODUCTS } from '@/lib/data';
import { productFaqs } from '@/lib/seo/productFaq';
import { faqJsonLd } from '@/lib/seo/controls';
import { DEFAULT_CONTROLS } from '@/lib/seo/controls';

const site = PRODUCTS[0];

describe('the questions every listing page answers by itself', () => {
  it('come from the listing’s own facts and the shop rules', () => {
    const f = productFaqs({ ...site, inc: ['Menu page', 'Booking form'], days: 3, express: 15, setupPrice: 30, customPrice: 100 });
    const text = JSON.stringify(f);
    expect(f[0]).toEqual({ q: `What do I get with ${site.name}?`, a: 'Menu page, Booking form.' });
    expect(text).toContain('within 3 days');
    expect(text).toContain('24-hour express delivery for $15');
    expect(text).toContain('setup help for $30 and customisation for $100');
    expect(text).toContain('own domain'); // a website
    expect(text).toContain('escrow');
    expect(f.every((x) => x.q.trim() && x.a.trim())).toBe(true);
  });
  it('leave out what the listing does not have, and never invent a price', () => {
    const f = productFaqs({ ...site, inc: [], express: undefined, setupPrice: 0, customPrice: 0, demo: undefined, sample: undefined });
    const text = JSON.stringify(f);
    expect(text).not.toContain('express');
    expect(text).not.toContain('setup help for');
    expect(text).not.toContain('customisation for');
    expect(text).not.toContain('Can I see it before I buy');
    expect(f.some((x) => x.q.startsWith('What do I get'))).toBe(false);
  });
  it('fit each kind of product: app store account, digital files, support and licence', () => {
    const app = ALL_PRODUCTS.find((p) => p.platform === 'android')!;
    expect(productFaqs(app).some((x) => x.q === 'Who publishes the app?' && x.a.includes('Google Play'))).toBe(true);
    expect(productFaqs(app).some((x) => x.q.includes('own domain'))).toBe(false);
    const dig = ALL_PRODUCTS.find((p) => p.platform === 'digital')!;
    const d = productFaqs({ ...dig, supportDays: 90, updateDays: 365, requirements: 'Node 20', licence: 'single_project' });
    expect(d.some((x) => x.q === 'How do I get the files?')).toBe(true);
    expect(d.some((x) => x.a.includes('Support lasts 90 days and updates last 1 year'))).toBe(true);
    expect(d.some((x) => x.a.includes('Node 20'))).toBe(true);
    expect(d.some((x) => x.q === 'What licence comes with it?')).toBe(true);
    expect(d.some((x) => x.q === 'How long does delivery take?')).toBe(false);
  });
  it('make FAQ structured data from the same list', () => {
    const f = productFaqs(site);
    const ld = faqJsonLd({ ...DEFAULT_CONTROLS, faqs: f })!;
    expect(ld.mainEntity).toHaveLength(f.length);
  });
});
