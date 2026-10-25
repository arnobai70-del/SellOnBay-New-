import { describe, expect, it } from 'vitest';
import { mayUseDemoAdmin, shellRole } from '@/lib/admin/mode';

describe('admin auth fail-closed configuration', () => {
  it('denies unauthenticated admin fallback when production DB is missing', () => {
    expect(mayUseDemoAdmin({ NODE_ENV: 'production' })).toBe(false);
    expect(mayUseDemoAdmin({ NODE_ENV: 'production', LAUNCHBAY_DEMO: '0' })).toBe(false);
    expect(mayUseDemoAdmin({ NODE_ENV: 'production', LAUNCHBAY_DEMO: '' })).toBe(false);
  });
  it('allows explicitly isolated demo mode and local prototypes', () => {
    expect(mayUseDemoAdmin({ NODE_ENV: 'production', LAUNCHBAY_DEMO: '1' })).toBe(true);
    expect(mayUseDemoAdmin({ NODE_ENV: 'development' })).toBe(true);
    expect(mayUseDemoAdmin({ NODE_ENV: 'test' })).toBe(true);
  });
});

describe('the menu on shared dashboard pages (Messages)', () => {
  const live = { NODE_ENV: 'production' };
  const demo = { NODE_ENV: 'production', LAUNCHBAY_DEMO: '1' };
  it('a signed-in person always gets their own menu, whatever the address says', () => {
    expect(shellRole('admin', undefined, live)).toBe('admin');
    expect(shellRole('admin', 'buyer', live)).toBe('admin');
    expect(shellRole('buyer', 'admin', live)).toBe('buyer'); // a buyer cannot ask for the admin menu
    expect(shellRole('seller', 'admin', demo)).toBe('seller');
  });
  it('without accounts the page keeps the view it was opened from', () => {
    expect(shellRole(undefined, 'admin', demo)).toBe('admin');
    expect(shellRole(undefined, 'seller', demo)).toBe('seller');
    expect(shellRole(undefined, undefined, demo)).toBe('buyer');
    expect(shellRole(undefined, 'nonsense', demo)).toBe('buyer');
    expect(shellRole(undefined, 'admin', live)).toBe('buyer'); // no admin menu where the demo admin is not allowed
  });
});
