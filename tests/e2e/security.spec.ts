import { expect, test, type APIRequestContext } from '@playwright/test';

/* Security headers on pages and API answers, and the pages still work under them (no blocked scripts, styles, images, frames or connections). */
const DEMO = process.env.DEMO_URL ?? 'http://localhost:3002';
const CARD = { number: '4242424242424242', exp: '12/34', cvc: '123', name: 'Test Buyer' };

const order = async (r: APIRequestContext) => {
  const id = (await (await r.post(`${DEMO}/api/demo/orders`, { data: { productId: 'saffron-table', pkg: 'asis', domainMode: 'own', own: 'mybakery.com' } })).json()).id as string;
  await r.post(`${DEMO}/api/demo/orders/${id}/pay`, { data: { card: CARD } });
  return id;
};

test.describe('security headers', () => {
  for (const path of ['/', '/browse', '/product/saffron-table', '/login', '/api/domains?name=bakery', '/robots.txt']) {
    test(`${path} carries the headers`, async ({ request }) => {
      const h = (await request.get(`${DEMO}${path}`)).headers();
      expect(h['strict-transport-security']).toMatch(/max-age=\d{7,}/);
      expect(h['x-content-type-options']).toBe('nosniff');
      expect(h['x-frame-options']).toBe('SAMEORIGIN');
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(h['permissions-policy']).toContain('camera=()');
      expect(h['x-powered-by']).toBeUndefined();
      const csp = h['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).not.toMatch(/script-src[^;]*\*(?!\.)/); // no wildcard script source
      expect(csp).not.toContain("'unsafe-eval'");
    });
  }
  test('the hosted seller demos keep their own sandbox policy (the global one skips /demo)', async ({ request }) => {
    const r = await request.get(`${DEMO}/demo/does-not-exist/index.html`);
    expect(r.headers()['content-security-policy'] ?? '').not.toContain("default-src 'self'");
  });
});

test.describe('the site still works under the policy', () => {
  test('main pages load without a single blocked resource or script error', async ({ page, request }) => {
    const id = await order(request);
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('securitypolicyviolation' as never, () => {});
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) =>
        console.error('Content Security Policy: ' + e.violatedDirective + ' ' + e.blockedURI + ' at ' + location.pathname + ' ' + (e.sourceFile || '') + ':' + e.lineNumber),
      );
    });
    for (const path of [
      '/',
      '/browse',
      '/product/saffron-table',
      '/apps/android',
      '/developers',
      '/domains',
      '/checkout?id=saffron-table',
      '/find',
      `/orders/${id}`,
      '/login',
      '/dashboard/admin',
      '/notifications',
      '/how-it-works',
      '/refunds',
    ]) {
      await page.goto(`${DEMO}${path}`, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
    }
    expect(problems).toEqual([]);
  });
});
