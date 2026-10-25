import { describe, expect, it } from 'vitest';
import { RISE_MAX_STEPS, RISE_STEP_MS, riseDelay, shouldRise } from '@/lib/motion';

describe('store home motion', () => {
  it('staggers items and stops adding delay after a few', () => {
    expect(riseDelay(0)).toBe(0);
    expect(riseDelay(1)).toBe(RISE_STEP_MS);
    expect(riseDelay(3)).toBe(3 * RISE_STEP_MS);
    expect(riseDelay(RISE_MAX_STEPS + 20)).toBe(RISE_MAX_STEPS * RISE_STEP_MS);
    expect(riseDelay(RISE_MAX_STEPS * 10)).toBeLessThanOrEqual(1000); // the last card in a long row is never left waiting
  });

  it('never gives a negative or fractional delay', () => {
    expect(riseDelay(-3)).toBe(0);
    expect(riseDelay(2.7)).toBe(2 * RISE_STEP_MS);
    expect(Number.isInteger(riseDelay(5))).toBe(true);
  });

  it('only hides groups that start below the screen', () => {
    expect(shouldRise(1200, 800, false)).toBe(true);
    expect(shouldRise(800, 800, false)).toBe(true);
    expect(shouldRise(799, 800, false)).toBe(false); // already peeking in: left alone, no blink
    expect(shouldRise(-300, 800, false)).toBe(false); // scrolled past (back button, anchor): left alone
  });

  it('hides nothing for reduced motion or an unknown screen height', () => {
    expect(shouldRise(5000, 800, true)).toBe(false);
    expect(shouldRise(5000, 0, false)).toBe(false);
  });
});
