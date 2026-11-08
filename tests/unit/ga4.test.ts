import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gaPage, gaReferrer, installGtag } from '@/lib/ga4';

const UUID = '3f2b8c1e-9a47-4d10-8f6e-1c2d3e4f5a6b';
describe('what Google may see of an address', () => {
  it('keeps a public page as it is, with its query', () => {
    expect(gaPage('/', '')).toEqual({ path: '/', title: null });
    expect(gaPage('/websites/saas-dashboard', 'ref=home')).toEqual({ path: '/websites/saas-dashboard?ref=home', title: null });
    expect(gaPage('/search', '?q=shop').path).toBe('/search?q=shop');
  });
  it('takes ids and the query off a private page, and stands in for its title', () => {
    expect(gaPage(`/orders/${UUID}`, 'x=1')).toEqual({ path: '/orders/[id]', title: '/orders/[id]' });
    expect(gaPage(`/pay/${UUID}`).path).toBe('/pay/[id]');
    expect(gaPage(`/messages/${UUID}`).path).toBe('/messages/[id]');
    expect(gaPage(`/dashboard/buyer/requests/${UUID}`).path).toBe('/dashboard/buyer/requests/[id]');
    expect(gaPage('/dashboard/admin/seo/post', 'slug=secret-draft').path).toBe('/dashboard/admin/seo/post');
    expect(gaPage('/reset-password', 'code=abc123').path).toBe('/reset-password');
    expect(gaPage('/login', 'next=/orders/abc').path).toBe('/login');
    expect(gaPage('/checkout', 'id=my-listing').path).toBe('/checkout');
  });
  it('treats every part after an order, payment or message area as an id, even a plain word', () => {
    expect(gaPage('/orders/plainword').path).toBe('/orders/[id]');
  });
  it('does not treat a public address that only starts the same as private', () => {
    expect(gaPage('/payments-guide', 'a=1').path).toBe('/payments-guide?a=1');
    expect(gaPage('/sell', 'a=1').path).toBe('/sell?a=1');
  });
  it('never sends a hash', () => {
    expect(gaPage('/reset-password#access_token=abc').path).toBe('/reset-password');
    expect(gaPage('/help#contact').path).toBe('/help');
  });
  it('cleans a referrer from this site and leaves another site alone', () => {
    const o = 'https://sellonbay.com';
    expect(gaReferrer(`${o}/orders/${UUID}?a=1`, o)).toBe(`${o}/orders/[id]`);
    expect(gaReferrer('https://google.com/', o)).toBe('https://google.com/');
    expect(gaReferrer('', o)).toBe('');
    expect(gaReferrer('not a url', o)).toBe('');
  });
});

describe('where GA is mounted', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');
  it('the root layout loads it, once, and the consent check is still in the component', () => {
    expect(read('app', 'layout.tsx')).toContain('<GoogleAnalytics />');
    expect(read('app', '(site)', 'layout.tsx')).not.toContain('GoogleAnalytics');
    const src = read('components', 'GoogleAnalytics.tsx');
    expect(src).toContain('accepted() && !optedOutByBrowser()');
    expect(src).not.toContain('location.href');
  });
});

describe('direct GA4 gtag (D-G)', () => {
  it("pushes the function's arguments object, the only shape gtag.js acts on", () => {
    const w: { dataLayer?: unknown[] } = {};
    const gtag = installGtag(w);
    gtag('config', 'G-TEST', { send_page_view: false });
    expect(w.dataLayer).toHaveLength(1);
    const entry = w.dataLayer![0];
    expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    expect(Array.isArray(entry)).toBe(false);
    expect(Array.from(entry as ArrayLike<unknown>)).toEqual(['config', 'G-TEST', { send_page_view: false }]);
  });
  it('keeps entries already in the dataLayer', () => {
    const w = { dataLayer: ['earlier'] as unknown[] };
    installGtag(w)('event', 'page_view');
    expect(w.dataLayer).toHaveLength(2);
  });
  it('the measurement ID stays G-FEK9C0CM04, page views are sent by hand once, and there is no GTM container', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'GoogleAnalytics.tsx'), 'utf8');
    expect(src).toContain("'G-FEK9C0CM04'");
    expect(src).toContain('send_page_view: false');
    expect(src).not.toMatch(/GTM-[A-Z0-9]+/);
    expect(src).toContain('installGtag');
    expect(src).not.toMatch(/push\(args\)/);
  });
});
