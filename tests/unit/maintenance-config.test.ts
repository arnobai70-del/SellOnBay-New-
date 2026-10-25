import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALWAYS_ON_API, MODULE_KEYS, isModuleKey, moduleOfApi, moduleOfPage } from '@/lib/maintenance/config';

const root = path.join(__dirname, '..', '..', 'app');
/* Every route file under a folder, as its URL path ("(site)" groups dropped, "[id]" kept as a sample segment). */
function routes(dir: string, file: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name === file)
        out.push(
          '/' +
            path
              .relative(root, d)
              .split(path.sep)
              .filter((s) => !/^\(.*\)$/.test(s))
              .map((s) => s.replace(/^\[.*\]$/, 'x'))
              .join('/'),
        );
    }
  };
  walk(dir);
  return out.map((p) => p.replace(/\/$/, '') || '/');
}

/* Pages that stay open whatever is in maintenance: the home page, information and policy pages, and redirects. */
const OPEN_PAGES = [
  '/',
  '/welcome',
  '/explore',
  '/how-it-works',
  '/faq',
  '/sell',
  '/terms',
  '/privacy',
  '/refunds',
  '/acceptable-use',
  '/seller-agreement',
  '/dmca',
  '/report-abuse',
  '/dashboard',
  '/dashboard/admin/audit',
  '/dashboard/admin/maintenance',
  '/maintenance/x',
  '/login',
  '/login/mfa',
];

describe('module registry', () => {
  it('has the thirteen modules the owner listed', () => {
    expect(MODULE_KEYS).toEqual(['auth', 'visitor', 'buyer', 'seller', 'admin', 'catalog', 'upload', 'checkout', 'orders', 'messaging', 'seo', 'ai', 'disputes']);
    expect(isModuleKey('seller')).toBe(true);
    expect(isModuleKey('toString')).toBe(false);
  });

  it('puts every API route in a module, or keeps it always open on purpose', () => {
    const apis = routes(path.join(root, 'api'), 'route.ts').map((p) => p.replace(/^\/api/, ''));
    expect(apis.length).toBeGreaterThan(60);
    const loose = apis.filter((p) => moduleOfApi(p) === null && !ALWAYS_ON_API.some((re) => re.test(p)));
    expect(loose).toEqual([]);
  });

  it('puts every page in a module, or in the short list of pages that always stay open', () => {
    const pages = routes(root, 'page.tsx');
    expect(pages.length).toBeGreaterThan(50);
    const loose = pages.filter((p) => moduleOfPage(p) === null && !OPEN_PAGES.includes(p));
    expect(loose).toEqual([]);
  });

  it('never closes payment webhooks, scheduled jobs, the health check or the way back', () => {
    for (const p of ['/api/webhooks/payment', '/api/cron/orders', '/api/cron/payouts', '/api/health', '/api/admin/maintenance']) expect(moduleOfApi(p)).toBeNull();
    expect(moduleOfPage('/dashboard/admin/maintenance')).toBeNull();
    expect(moduleOfPage('/dashboard/admin/audit')).toBeNull();
    expect(moduleOfPage('/login')).toBeNull(); // nobody, admins included, is locked out
    expect(moduleOfPage('/reset-password')).toBe('auth');
  });

  it('matches the owner examples: one module closed leaves the others', () => {
    // seller maintenance: the buyer dashboard and browsing are elsewhere
    expect(moduleOfPage('/dashboard/seller')).toBe('seller');
    expect(moduleOfPage('/dashboard/buyer')).toBe('buyer');
    expect(moduleOfPage('/browse')).toBe('catalog');
    // payment maintenance: new orders and paying close, browsing and search do not
    expect(moduleOfApi('/api/demo/orders')).toBe('checkout');
    expect(moduleOfApi('/api/demo/orders/abc/pay')).toBe('checkout');
    expect(moduleOfApi('/api/hire')).toBe('checkout');
    expect(moduleOfPage('/product/x')).toBe('catalog');
    // SEO maintenance: only the blog and the SEO screens
    expect(moduleOfPage('/dashboard/admin/seo/pages/edit')).toBe('seo');
    expect(moduleOfApi('/api/admin/seo/pages')).toBe('seo');
    expect(moduleOfPage('/apps/digital')).toBe('catalog');
    // upload maintenance: listing changes close, existing products stay
    expect(moduleOfApi('/api/listings')).toBe('upload');
    expect(moduleOfPage('/sell/new')).toBe('upload');
    expect(moduleOfPage('/sell')).toBeNull();
  });

  it('sends order sub-routes to the right module', () => {
    expect(moduleOfApi('/api/orders/abc/accept')).toBe('orders');
    expect(moduleOfApi('/api/demo/orders/abc/download')).toBe('orders');
    expect(moduleOfApi('/api/orders/abc/messages')).toBe('messaging');
    expect(moduleOfApi('/api/demo/orders/abc/dispute')).toBe('disputes');
    expect(moduleOfApi('/api/orders/abc/evidence')).toBe('disputes');
    expect(moduleOfApi('/api/download/tok')).toBe('orders');
    expect(moduleOfApi('/api/admin/users/x/action')).toBe('admin');
    expect(moduleOfApi('/api/admin/disputes/x/decide')).toBe('disputes');
  });

  it('ignores a trailing slash and the query', () => {
    expect(moduleOfPage('/checkout/?id=1')).toBe('checkout');
    expect(moduleOfApi('/api/listings/')).toBe('upload');
  });
});
