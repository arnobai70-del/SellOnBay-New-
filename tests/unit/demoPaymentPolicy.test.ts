import { describe, expect, it } from 'vitest';
import { canUseDemoPayment } from '@/lib/commerce/demoPaymentPolicy';

type Check = Parameters<typeof canUseDemoPayment>[0];
const example: Check = { demo: true, kind: 'product', sellerId: null, productId: null, devKey: null };

describe('fake payment isolation', () => {
  it('only allows built-in example product orders', () => {
    expect(canUseDemoPayment(example)).toBe(true);
  });

  it('rejects a real seller order even if the demo flag is accidentally on', () => {
    expect(canUseDemoPayment({ ...example, demo: false, sellerId: 'seller-1', productId: 'product-1' })).toBe(false);
    expect(canUseDemoPayment({ ...example, sellerId: 'seller-1' })).toBe(false);
    expect(canUseDemoPayment({ ...example, productId: 'product-1' })).toBe(false);
  });

  it('rejects developer jobs, paid trials and custom work', () => {
    expect(canUseDemoPayment({ ...example, kind: 'custom', devKey: 'dev-1' })).toBe(false);
    expect(canUseDemoPayment({ ...example, kind: 'trial', devKey: 'dev-1' })).toBe(false);
    expect(canUseDemoPayment({ ...example, devKey: 'dev-1' })).toBe(false);
    expect(canUseDemoPayment({ ...example, kind: 'trial' })).toBe(false);
  });

  it('rejects a malformed or contradictory order', () => {
    expect(canUseDemoPayment({ ...example, demo: false })).toBe(false);
    expect(canUseDemoPayment({ ...example, demo: false, sellerId: 'seller-1' })).toBe(false);
  });
});
