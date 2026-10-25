import { describe, expect, it } from 'vitest';
import { CONFIG, DAY_MS } from '@/lib/config';
import { beat, isStale, lastBeat } from '@/lib/heartbeat';
import { launchChecks } from '@/lib/launchCheck';

describe('scheduled job heartbeat', () => {
  it('remembers when each job last finished', async () => {
    await beat('orders', 1_000);
    await beat('payouts', 2_000);
    expect(await lastBeat('orders')).toBe(1_000);
    expect(await lastBeat('payouts')).toBe(2_000);
  });

  it('calls a job late only after its window, and never before its first run', () => {
    expect(CONFIG.cron).toEqual({ ordersStaleMinutes: 30, payoutsStaleDays: 8, ledgerRecheckDays: 3 });
    const now = 10 * DAY_MS;
    expect(isStale('orders', now - 29 * 60_000, now)).toBe(false);
    expect(isStale('orders', now - 31 * 60_000, now)).toBe(true);
    expect(isStale('payouts', now - 7 * DAY_MS, now)).toBe(false);
    expect(isStale('payouts', now - 9 * DAY_MS, now)).toBe(true);
    expect(isStale('orders', null, now)).toBe(false);
  });

  it('shows the last run on the launch check, and a stopped scheduler is not ok', async () => {
    const before = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'x'.repeat(32);
    try {
      await beat('orders');
      await beat('payouts');
      let jobs = (await launchChecks()).find((c) => c.name === 'Scheduled jobs')!;
      expect(jobs.state).toBe('ok');
      expect(jobs.note).toMatch(/Orders job last finished: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\./);
      await beat('orders', Date.now() - 31 * 60_000);
      jobs = (await launchChecks()).find((c) => c.name === 'Scheduled jobs')!;
      expect(jobs.state).toBe('todo');
      expect(jobs.note).toContain('(late)');
    } finally {
      if (before === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = before;
    }
  });
});
