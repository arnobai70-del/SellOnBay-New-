import { describe, expect, it } from 'vitest';
import { BUYERS_ONLY, mayBuy } from '@/lib/accounts';

describe('who may buy', () => {
  it('buyer and seller accounts buy, hire or ask sellers questions (one account buys and sells, owner 2026-11-07)', () => {
    expect(mayBuy('buyer')).toBe(true);
    expect(mayBuy('seller')).toBe(true);
    for (const r of ['admin', '', null, undefined]) expect(mayBuy(r)).toBe(false);
  });
  it('tells the person what to do instead', () => expect(BUYERS_ONLY).toMatch(/your own account/));
});
