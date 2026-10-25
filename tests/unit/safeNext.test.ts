import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safeNext';

describe('safeNext', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/dashboard/seller?tab=orders#x')).toBe('/dashboard/seller?tab=orders#x');
  });
  it('refuses anything that leaves the site', () => {
    for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', 'evil.com', '/\tevil', '', null, undefined, 42]) expect(safeNext(bad, '/home')).toBe('/home');
  });
});
