import { describe, expect, it } from 'vitest';
import { TEMPLATES, type NotificationKind } from '@/emails/templates';
import { cannotAct } from '@/lib/accounts';
import { CONFIG } from '@/lib/config';
import { markRead, notificationsFor, notify, unreadCount } from '@/lib/notify';
import { saveBlocked } from '@/lib/presale/service';
import { actionsFor, applyStrikes, isSuspended, unsuspend } from '@/lib/strikes';

const block = (senderId: string) => saveBlocked({ senderId, sellerId: null, productKey: 'p', body: 'call me', reason: 'phone', ip: '1.1.1.1' });

describe('strikes for blocked messages', () => {
  it('three blocks in 30 days: a warning. Five: a suspension and an admin alert. Nothing before.', async () => {
    const u = 'strike-user-1';
    for (let i = 1; i <= 2; i++) {
      await block(u);
      expect(actionsFor(u)).toHaveLength(0);
      expect(await notificationsFor(u)).toHaveLength(0);
    }
    await block(u); // 3
    expect(actionsFor(u).map((a) => a.action)).toEqual(['warning']);
    expect((await notificationsFor(u)).map((n) => n.kind)).toEqual(['chat_warning']);
    await block(u); // 4
    expect(actionsFor(u)).toHaveLength(1);
    expect(isSuspended(u)).toBe(false);
    await block(u); // 5
    expect(isSuspended(u)).toBe(true);
    expect(actionsFor(u).map((a) => a.action)).toEqual(['warning', 'suspended']);
    expect((await notificationsFor(u)).map((n) => n.kind).sort()).toEqual(['account_suspended', 'chat_warning']);
    await block(u); // 6: already suspended, no second suspension
    expect(actionsFor(u).filter((a) => a.action === 'suspended')).toHaveLength(1);
  });
  it('the suspension lasts the configured days and can be lifted by an admin', async () => {
    const u = 'strike-user-2';
    const now = 1_800_000_000_000;
    expect(await applyStrikes(u, CONFIG.chat.suspendAtBlocks, now)).toBe('suspended');
    const a = actionsFor(u).find((x) => x.action === 'suspended')!;
    expect(a.until).toBe(now + CONFIG.chat.suspendDays * 86_400_000);
    expect(isSuspended(u, now + 1000)).toBe(true);
    expect(isSuspended(u, a.until! + 1)).toBe(false);
    await unsuspend(u, 'admin-1');
    expect(isSuspended(u)).toBe(false);
    expect(actionsFor(u).at(-1)?.action).toBe('unsuspended');
  });
  it('after a suspension is lifted the old blocks do not count again', async () => {
    const u = 'strike-user-3';
    for (let i = 0; i < CONFIG.chat.suspendAtBlocks; i++) await block(u);
    expect(isSuspended(u)).toBe(true);
    await unsuspend(u, 'admin-1');
    await new Promise((r) => setTimeout(r, 2));
    await block(u);
    expect(isSuspended(u)).toBe(false);
    expect(actionsFor(u).filter((a) => a.action === 'suspended')).toHaveLength(1);
    for (let i = 1; i < CONFIG.chat.suspendAtBlocks; i++) await block(u);
    expect(isSuspended(u)).toBe(true);
  });
  it('blocks of different people are counted separately', async () => {
    await block('strike-a');
    await block('strike-a');
    await block('strike-b');
    expect(actionsFor('strike-a')).toHaveLength(0);
    expect(actionsFor('strike-b')).toHaveLength(0);
  });
});

describe('who can act', () => {
  it('a banned or suspended profile cannot; a missing one cannot; an old suspension does not count', () => {
    const now = Date.now();
    expect(cannotAct(null)).toBe(true);
    expect(cannotAct({ banned: true })).toBe(true);
    expect(cannotAct({ banned: false, suspended_until: new Date(now + 3600_000).toISOString() })).toBe(true);
    expect(cannotAct({ banned: false, suspended_until: new Date(now - 3600_000).toISOString() })).toBe(false);
    expect(cannotAct({ banned: false, suspended_until: null })).toBe(false);
  });
});

describe('notifications', () => {
  it('stores one per event, counts unread, marks read', async () => {
    const u = 'notif-user-1';
    expect(await notify(u, 'order_funded', { title: 'Saffron Table', days: 2 })).toBe(true);
    await notify(u, 'order_delivered', { title: 'Saffron Table' });
    expect(await unreadCount(u)).toBe(2);
    const [first] = await notificationsFor(u);
    await markRead(u, first.id);
    expect(await unreadCount(u)).toBe(1);
    await markRead(u, 'all');
    expect(await unreadCount(u)).toBe(0);
  });
  it('a reminder with the same dedupe key is sent once', async () => {
    const u = 'notif-user-2';
    expect(await notify(u, 'order_due_soon', { title: 'x' }, { dedupe: 'due_soon:o1' })).toBe(true);
    expect(await notify(u, 'order_due_soon', { title: 'x' }, { dedupe: 'due_soon:o1' })).toBe(false);
    expect(await notify(u, 'order_due_soon', { title: 'x' }, { dedupe: 'due_soon:o2' })).toBe(true);
    expect(await notificationsFor(u)).toHaveLength(2);
  });
  it('nobody is notified for a missing person', async () => {
    expect(await notify(null, 'order_funded')).toBe(false);
  });
  it('every kind has a short subject and text, and none leaks a secret placeholder', () => {
    for (const k of Object.keys(TEMPLATES) as NotificationKind[]) {
      const { subject, text } = TEMPLATES[k]({});
      expect(subject.length, k).toBeGreaterThan(5);
      expect(subject.length, k).toBeLessThan(90);
      expect(text.length, k).toBeGreaterThan(10);
      expect(subject + text, k).not.toMatch(/undefined|null|\[object/);
    }
  });
});
