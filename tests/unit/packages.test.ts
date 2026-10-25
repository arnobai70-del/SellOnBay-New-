import { describe, expect, it } from 'vitest';
import { CONFIG } from '@/lib/config';
import { PKG, pkgCost, pkgOffered } from '@/lib/data';

describe('what setup help and customisation cost on one listing', () => {
  it('a listing without its own prices has the defaults, which are what every listing had before sellers chose', () => {
    expect(PKG).toEqual({ asis: 0, setup: 30, custom: 100 });
    expect(pkgCost({}, 'asis')).toBe(0);
    expect(pkgCost({}, 'setup')).toBe(30);
    expect(pkgCost({}, 'custom')).toBe(100);
  });
  it("the seller's own price replaces the default, per package", () => {
    expect(pkgCost({ setupPrice: 75 }, 'setup')).toBe(75);
    expect(pkgCost({ setupPrice: 75 }, 'custom')).toBe(100);
    expect(pkgCost({ customPrice: 250 }, 'custom')).toBe(250);
  });
  it('0 means the seller does not offer it; as is is always offered', () => {
    expect(pkgOffered({ setupPrice: 0 }, 'setup')).toBe(false);
    expect(pkgOffered({ customPrice: 0 }, 'custom')).toBe(false);
    expect(pkgOffered({ setupPrice: 0, customPrice: 0 }, 'asis')).toBe(true);
    expect(pkgOffered({}, 'setup')).toBe(true);
  });
  it('the choices a seller sees include "not offered" and the default, and are in order', () => {
    for (const [list, def] of [
      [CONFIG.packages.setupCents, CONFIG.packages.defaultSetupCents],
      [CONFIG.packages.customCents, CONFIG.packages.defaultCustomCents],
    ] as const) {
      expect(list[0]).toBe(0);
      expect(list).toContain(def);
      expect([...list]).toEqual([...list].sort((a, b) => a - b));
    }
  });
});
