import { describe, expect, it } from 'vitest';
import { auditList } from '@/lib/admin/audit';
import { CONFIG, DAY_MS, HOUR_MS } from '@/lib/config';
import { activeBlocks, blockEmail, ipKey, blockKey, normalizeEmail, check, clusters, hashKey, liftBlock, purgeSecurityEvents, recentLimitHits, seenFirst, type Action } from '@/lib/guard';

let n = 0;
const ip = () => `198.51.${Math.floor(++n / 250)}.${n % 250}`;
const uid = () => `guard-user-${Date.now()}-${++n}`;
const dev = () => `device-${Date.now()}-${++n}-abcdef`;
const run = (action: Action, s: { userId?: string | null; ip: string; device?: string | null }, now = Date.now()) =>
  check(action, { userId: s.userId ?? null, ip: s.ip, device: s.device ?? null }, now);

describe('hashing', () => {
  it('only a hash is kept, the same input gives the same hash and a connection never equals a device', () => {
    expect(hashKey('ip', '203.0.113.9')).toMatch(/^[0-9a-f]{24}$/);
    expect(hashKey('ip', '203.0.113.9')).toBe(hashKey('ip', '203.0.113.9'));
    expect(hashKey('ip', '203.0.113.9')).not.toBe(hashKey('device', '203.0.113.9'));
    expect(hashKey('ip', '203.0.113.9')).not.toContain('203');
  });
});

describe('which addresses are people', () => {
  it('this computer and private networks are not limited as a group, public addresses are', () => {
    for (const a of ['unknown', '', '127.0.0.1', '::1', '::ffff:127.0.0.1', '10.1.2.3', '192.168.0.9', 'fe80::1', 'fd12::1']) expect(ipKey(a)).toBeNull();
    for (const a of ['203.0.113.9', '198.51.100.7', '2001:db8::1']) expect(ipKey(a)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('limits', () => {
  it('a person is stopped at the per-person limit, and others are not', async () => {
    const u = uid();
    seenFirst(u, 0); // an old account
    const max = CONFIG.limits.actions.order.perUser;
    for (let i = 0; i < max; i++) expect((await run('order', { userId: u, ip: ip() })).ok).toBe(true);
    expect(await run('order', { userId: u, ip: ip() })).toMatchObject({ ok: false, status: 429 });
    expect((await run('order', { userId: uid(), ip: ip() })).ok).toBe(true);
  });
  it('a new account gets the lower limit and a message that says so; it grows up after the new-account days', async () => {
    const u = uid();
    const now = Date.now();
    seenFirst(u, now);
    const max = CONFIG.limits.actions.listing.newMax;
    for (let i = 0; i < max; i++) expect((await run('listing', { userId: u, ip: ip() }, now)).ok).toBe(true);
    const refused = await run('listing', { userId: u, ip: ip() }, now);
    expect(refused).toMatchObject({ ok: false, status: 429 });
    expect(!refused.ok && refused.error).toMatch(/New accounts/);
    const old = uid();
    seenFirst(old, now - (CONFIG.limits.newAccountDays + 1) * DAY_MS);
    for (let i = 0; i < max + 1; i++) expect((await run('listing', { userId: old, ip: ip() }, now)).ok).toBe(true);
  });
  it('one connection is limited across accounts', async () => {
    const shared = ip();
    const max = CONFIG.limits.actions.hire.perIp;
    for (let i = 0; i < max; i++) {
      const u = uid();
      seenFirst(u, 0);
      expect((await run('hire', { userId: u, ip: shared })).ok).toBe(true);
    }
    expect(await run('hire', { userId: uid(), ip: shared })).toMatchObject({ ok: false, status: 429 });
  });
  it('the window slides: after the hours pass, the person can act again', async () => {
    const u = uid();
    seenFirst(u, 0);
    const t0 = Date.now();
    for (let i = 0; i < CONFIG.limits.actions.order.perUser; i++) await run('order', { userId: u, ip: ip() }, t0);
    expect((await run('order', { userId: u, ip: ip() }, t0)).ok).toBe(false);
    expect((await run('order', { userId: u, ip: ip() }, t0 + CONFIG.limits.actions.order.hours * HOUR_MS + 1)).ok).toBe(true);
  });
  it('sign-in tries on one mailbox are limited even when every try comes from a new address', async () => {
    const email = `guard-${Date.now()}-${++n}@example.com`;
    for (let i = 0; i < CONFIG.limits.actions.login.perEmail; i++) expect((await check('login', { userId: null, ip: ip(), device: null, email }, Date.now())).ok).toBe(true);
    expect(await check('login', { userId: null, ip: ip(), device: null, email }, Date.now())).toMatchObject({ ok: false, status: 429 });
    expect((await check('login', { userId: null, ip: ip(), device: null, email: `other-${email}` }, Date.now())).ok).toBe(true);
  });
  it('an unknown connection is never limited as a group, a known one is', async () => {
    for (let i = 0; i < CONFIG.limits.actions.signup.perIp + 3; i++) expect((await run('signup', { ip: 'unknown' })).ok).toBe(true);
    const a = ip();
    for (let i = 0; i < CONFIG.limits.actions.signup.perIp; i++) expect((await run('signup', { ip: a })).ok).toBe(true);
    expect(await run('signup', { ip: a })).toMatchObject({ ok: false, status: 429 });
  });
});

describe('blocks', () => {
  it('a blocked connection or device is refused for every action until the block is lifted, and each step is audited', async () => {
    const a = ip();
    const d = dev();
    const key = hashKey('ip', a);
    expect((await blockKey('admin-1', 'ip', key, 'no')).ok).toBe(false); // a reason is needed
    expect((await blockKey('admin-1', 'ip', 'not-a-key', 'Fake accounts.')).ok).toBe(false);
    expect((await blockKey('admin-1', 'ip', key, 'Fake accounts all day.')).ok).toBe(true);
    expect((await blockKey('admin-1', 'ip', key, 'Fake accounts all day.')).ok).toBe(false); // once
    expect(await run('order', { ip: a })).toMatchObject({ ok: false, status: 403 });
    expect(await run('signup', { ip: a, device: d })).toMatchObject({ ok: false, status: 403 });
    expect((await run('order', { ip: ip(), device: d })).ok).toBe(true); // another connection, and the device is not blocked
    const dkey = hashKey('device', d);
    expect((await blockKey('admin-1', 'device', dkey, 'Same laptop, many accounts.')).ok).toBe(true);
    expect(await run('order', { ip: ip(), device: d })).toMatchObject({ ok: false, status: 403 });
    const mine = (await activeBlocks()).filter((b) => b.key === key || b.key === dkey);
    expect(mine).toHaveLength(2);
    for (const b of mine) expect((await liftBlock('admin-1', b.id, 'Checked, it is fine.')).ok).toBe(true);
    expect((await liftBlock('admin-1', mine[0].id, 'Again.')).ok).toBe(false);
    expect((await run('order', { ip: a, device: d })).ok).toBe(true);
    const log = await auditList(300);
    expect(log.filter((e) => e.action === 'security_block' && (e.targetRef === key || e.targetRef === dkey))).toHaveLength(2);
    expect(log.some((e) => e.action === 'security_unblock')).toBe(true);
  });
});

describe('email blocks', () => {
  it('different spellings of one mailbox are one address', () => {
    expect(normalizeEmail('Mira.Chen+shop@Gmail.com')).toBe('mirachen@gmail.com');
    expect(normalizeEmail('mira.chen@googlemail.com')).toBe('mirachen@gmail.com');
    expect(normalizeEmail(' Sam+x@Example.org ')).toBe('sam@example.org');
    expect(normalizeEmail('a.b@example.org')).toBe('a.b@example.org'); // dots only count as nothing at Gmail
    expect(normalizeEmail('not an email')).toBe('not an email');
  });
  it('a blocked address cannot sign up or sign in in any spelling, other addresses can, and lifting works', async () => {
    const ip1 = ip();
    const victim = `Bad.Actor+${n}@Gmail.com`;
    const run2 = (email: string) => check('signup', { userId: null, ip: ip(), device: null, email });
    expect((await run2(victim)).ok).toBe(true);
    expect((await blockEmail('admin-1', victim, 'Lost a chargeback on this address.')).ok).toBe(true);
    expect((await blockEmail('admin-1', victim, 'Again, should be quiet.')).ok).toBe(true); // already blocked is fine
    expect((await blockEmail('admin-1', 'nope', 'Not an address at all.')).ok).toBe(false);
    expect(await run2(victim)).toMatchObject({ ok: false, status: 403 });
    expect(await run2(`badactor@gmail.com`)).toMatchObject({ ok: false, status: 403 });
    expect(await run2(`BADACTOR+other@googlemail.com`)).toMatchObject({ ok: false, status: 403 });
    expect((await run2(`someone.else${n}@gmail.com`)).ok).toBe(true);
    expect((await run('signup', { ip: ip1 })).ok).toBe(true); // no email given, nothing to match
    const mine = (await activeBlocks()).filter((b) => b.kind === 'email' && b.key === hashKey('email', normalizeEmail(victim)));
    expect(mine).toHaveLength(1);
    expect(mine[0].key).toMatch(/^[0-9a-f]{24}$/); // only a hash is kept
    expect((await liftBlock('admin-1', mine[0].id, 'It was a mistake.')).ok).toBe(true);
    expect((await run2(victim)).ok).toBe(true);
  });
});

describe('what the admins see', () => {
  it('many accounts on one connection are listed', async () => {
    const shared = ip();
    for (let i = 0; i < CONFIG.limits.cluster.accounts; i++) await run('order', { userId: uid(), ip: shared });
    const g = (await clusters()).find((c) => c.kind === 'ip' && c.key === hashKey('ip', shared));
    expect(g?.accounts.length).toBe(CONFIG.limits.cluster.accounts);
    expect(g?.blocked).toBe(false);
  });
  it('a connection that keeps hitting a limit shows up with what it tried', async () => {
    const a = ip();
    for (let i = 0; i < CONFIG.limits.actions.signup.perIp + 2; i++) await run('signup', { ip: a });
    const hit = (await recentLimitHits()).find((h) => h.ipHash === hashKey('ip', a));
    expect(hit?.actions['signup']).toBe(2);
  });
  it('old events are purged after the keep days and recent ones stay', async () => {
    const a = ip();
    const old = Date.now() - (CONFIG.limits.keepDays + 1) * DAY_MS;
    await run('signup', { ip: a }, old);
    await run('signup', { ip: a });
    expect(await purgeSecurityEvents()).toBeGreaterThanOrEqual(1);
    expect(await purgeSecurityEvents()).toBe(0);
  });
});
