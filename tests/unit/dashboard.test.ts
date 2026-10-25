import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/lib/config';
import { nextPayoutDay, onTimeShare, weeklyBuckets } from '@/lib/dashboard';
import { weekStartOf } from '@/lib/payouts';

describe('dashboard helpers', () => {
  it('on-time share counts only delivered orders and is null with none', () => {
    expect(onTimeShare([{ dueAt: 10 }])).toBeNull();
    expect(onTimeShare([{ dueAt: 10, deliveredAt: 9 }, { dueAt: 10, deliveredAt: 11 }, { dueAt: 5 }])).toBe(0.5);
  });
  it('weekly buckets run oldest to newest, end with this week and drop older sums', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    const b = weeklyBuckets(
      [
        { at: now, cents: 500 },
        { at: now - 7 * DAY_MS, cents: 300 },
        { at: now - 400 * DAY_MS, cents: 999 },
      ],
      now,
      4,
    );
    expect(b).toHaveLength(4);
    expect(b.at(-1)).toEqual({ week: weekStartOf(now), cents: 500 });
    expect(b.at(-2)!.cents).toBe(300);
    expect(b.reduce((s, x) => s + x.cents, 0)).toBe(800);
    expect(b[0].week < b[3].week).toBe(true);
  });
  it('next payout is the Sunday after this payout week', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(Date.parse(nextPayoutDay(now) + 'T00:00:00Z') - Date.parse(weekStartOf(now) + 'T00:00:00Z')).toBe(7 * DAY_MS);
  });
});
