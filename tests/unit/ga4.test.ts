import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installGtag } from '@/lib/ga4';

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
