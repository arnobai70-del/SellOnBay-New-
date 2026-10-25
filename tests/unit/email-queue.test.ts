import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '@/lib/config';

/* Emails of notifications go through email_outbox: sent after the response, retried by the scheduled job, given up after a few tries. */
type Row = { id: number; notification_id: string; status: string; attempts: number; next_at: number; sent_at?: string };
const s = vi.hoisted(() => ({
  outbox: [] as Row[],
  notes: new Map<string, { id: string; user_id: string; kind: string; payload: object }>(),
  later: [] as (() => Promise<unknown>)[],
  sent: [] as { to: string; key?: string }[],
  failSend: 0,
  now: 0,
}));
vi.mock('next/server', () => ({ after: (fn: () => Promise<unknown>) => void s.later.push(fn) }));
vi.mock('@/lib/providers/email', () => ({
  emailProvider: () => ({
    name: 'fake',
    send: async (m: { to: string; idempotencyKey?: string }) => {
      if (s.failSend > 0) {
        s.failSend--;
        throw new Error('provider down');
      }
      s.sent.push({ to: m.to, key: m.idempotencyKey });
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id.slice(0, 4)}@example.test` } } }) } },
    rpc: async (_: string, a: { max_rows: number; only_id: number | null }) => {
      const due = s.outbox.filter((r) => ['pending', 'sending'].includes(r.status) && r.next_at <= s.now && (a.only_id === null || r.id === a.only_id)).slice(0, a.max_rows);
      for (const r of due) Object.assign(r, { status: 'sending', attempts: r.attempts + 1, next_at: s.now + 300_000 });
      return { data: due.map((r) => ({ id: r.id, notification_id: r.notification_id, attempts: r.attempts })), error: null };
    },
    from: (t: string) => ({
      select: () => ({
        limit: async () => ({ error: null }),
        eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: s.notes.get(v) ?? null }) }),
      }),
      insert: (row: { notification_id: string }) => ({
        select: () => ({
          single: async () => {
            const r: Row = { id: s.outbox.length + 1, notification_id: row.notification_id, status: 'pending', attempts: 0, next_at: s.now };
            s.outbox.push(r);
            return { data: { id: r.id }, error: null };
          },
        }),
      }),
      update: (patch: { status: string; next_at?: string; sent_at?: string }) => ({
        eq: (_c: string, id: number) => ({
          eq: async () => {
            const r = s.outbox.find((x) => x.id === id && x.status === 'sending');
            if (r && t === 'email_outbox') Object.assign(r, { status: patch.status, sent_at: patch.sent_at, next_at: patch.next_at ? Date.parse(patch.next_at) - Date.now() + s.now : r.next_at });
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

const { queueEmail, sendQueued, retryDelayMs } = await import('@/lib/emailQueue');
const user = '2b1c7a4e-1f0a-4c3e-9d55-0d8f6c2e9a11';
const note = (id: string) => s.notes.set(id, { id, user_id: user, kind: 'repo_invite_resent', payload: {} });

describe('email queue', () => {
  beforeEach(() => {
    Object.assign(s, { outbox: [], later: [], sent: [], failSend: 0, now: 0 });
    s.notes.clear();
  });

  it('sends right after the response, once', async () => {
    note('n1');
    expect(await queueEmail('n1')).toBe(true);
    expect(s.sent).toEqual([]);
    await s.later[0]();
    expect(s.sent).toEqual([{ to: '2b1c@example.test', key: 'notification/n1' }]);
    expect(s.outbox[0].status).toBe('sent');
    expect(await sendQueued()).toEqual({ sent: 0, retry: 0, failed: 0 });
  });

  it('tries again later when the provider fails, then gives up', async () => {
    note('n2');
    await queueEmail('n2');
    s.failSend = 99;
    await s.later[0]();
    expect(s.outbox[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(await sendQueued()).toEqual({ sent: 0, retry: 0, failed: 0 }); // not due yet
    for (let i = 1; i < CONFIG.emailQueue.maxAttempts; i++) {
      s.now += retryDelayMs(i);
      await sendQueued();
    }
    expect(s.outbox[0]).toMatchObject({ status: 'failed', attempts: CONFIG.emailQueue.maxAttempts });
    expect(s.sent).toEqual([]);
  });

  it('recovers when the provider comes back', async () => {
    note('n3');
    await queueEmail('n3');
    s.failSend = 1;
    await s.later[0]();
    s.now += retryDelayMs(1);
    expect(await sendQueued()).toEqual({ sent: 1, retry: 0, failed: 0 });
    expect(s.sent).toHaveLength(1);
  });

  it('does not retry an email that can never be sent', async () => {
    await queueEmail('missing');
    expect(await sendQueued()).toEqual({ sent: 0, retry: 0, failed: 1 });
    expect(s.outbox[0].status).toBe('failed');
  });

  it('waits longer after each failed try', () => {
    expect([1, 2, 3, 4, 9].map(retryDelayMs)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 7_200_000]);
  });
});
