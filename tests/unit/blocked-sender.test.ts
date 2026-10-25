import { beforeEach, describe, expect, it, vi } from 'vitest';

/* With Supabase on, blocked_messages needs a real account as the sender (sender_id uuid references profiles). */
const inserts: unknown[] = [];
vi.mock('@/lib/supabase/env', () => ({ supabaseConfigured: true }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: unknown) => {
        inserts.push(row);
        return { error: null };
      },
      select: () => ({ eq: () => ({ gte: async () => ({ count: 1 }) }) }),
    }),
  }),
}));
const strikes = vi.hoisted(() => ({ applied: [] as string[] }));
vi.mock('@/lib/strikes', () => ({
  strikesSince: async () => 0,
  applyStrikes: async (id: string) => {
    strikes.applied.push(id);
  },
}));

const { saveBlocked } = await import('@/lib/presale/service');
const msg = { sellerId: null, productKey: 'saffron-table', body: 'mail me', reason: 'email', ip: '1.2.3.4', context: 'order' };

describe('saving a blocked message with Supabase on', () => {
  beforeEach(() => {
    inserts.length = 0;
    strikes.applied.length = 0;
  });

  it('writes an account holder to the table and counts their strikes', async () => {
    const id = '2b1c7a4e-1f0a-4c3e-9d55-0d8f6c2e9a11';
    await saveBlocked({ senderId: id, ...msg });
    expect(inserts).toHaveLength(1);
    expect(strikes.applied).toEqual([id]);
  });

  it('keeps a signed-out demo sender off the table, where the insert would fail', async () => {
    await saveBlocked({ senderId: 'demo:ord_123', ...msg });
    expect(inserts).toEqual([]);
    expect(strikes.applied).toEqual([]);
  });
});
