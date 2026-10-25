import { describe, expect, it } from 'vitest';
import { BUYERS_ONLY, mayBuy } from '@/lib/accounts';

describe('who may buy', () => {
  it('only a buyer account buys, hires or asks sellers questions', () => {
    expect(mayBuy('buyer')).toBe(true);
    for (const r of ['seller', 'admin', '', null, undefined]) expect(mayBuy(r)).toBe(false);
  });
  it('tells the person what to do instead', () => expect(BUYERS_ONLY).toMatch(/buyer account/));
});
