import { derivedSecret } from './secrets';
import 'server-only';
import { createHash } from 'node:crypto';
import { audit } from './admin/audit';
import { CONFIG, DAY_MS, HOUR_MS } from './config';
import { limit } from './rateLimit';
import { bump } from './metrics';
import { notifyAdmins } from './notify';
import { orderStore } from './orders/store';
import { createAdminClient, createClient } from './supabase/server';
import { clientAddress } from './clientIp';

/*
 * Abuse hardening in one place. Every write that can be spammed calls guard(action) first, and the answer is one of:
 *  - blocked: an admin blocked this connection or device (403),
 *  - too many: the limits in CONFIG.limits, per person AND per connection, lower for an account younger than newAccountDays (429),
 *  - ok: the event is written down (hashed connection and device, never the raw address) and the admins are alerted when many accounts share one
 *    connection or device, or when one connection keeps hitting a limit.
 * The device is a random id in the lb_dev cookie (set by the proxy). Limits are counted by limit() in lib/rateLimit.ts (Redis when set up, else memory).
 */
export type Action = keyof typeof CONFIG.limits.actions;
export type Subject = { userId: string | null; ip: string; device: string | null; email?: string | null };
export type Verdict = { ok: true } | { ok: false; status: 403 | 429; error: string };
export type BlockKind = 'ip' | 'device' | 'email';
type ClusterKind = 'ip' | 'device';
export type Block = { id: string; kind: BlockKind; key: string; reason: string; createdAt: number };
export type Cluster = { kind: ClusterKind; key: string; accounts: { id: string; name: string }[]; last: number; blocked: boolean };
export type LimitHit = { ipHash: string; actions: Record<string, number>; total: number; last: number; blocked: boolean };

export const DEVICE_COOKIE = 'lb_dev';
const BLOCKED_TEXT = 'This connection or device cannot do that right now. If you think this is a mistake, contact support.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ev = { userId: string | null; action: string; ip: string | null; device: string | null; at: number };
type MemBlock = Block & { liftedAt?: number };
type Mem = { events: Ev[]; blocks: MemBlock[]; firstSeen: Map<string, number>; names: Map<string, string> };
const mem: Mem = ((globalThis as { __guardMem?: Mem }).__guardMem ??= { events: [], blocks: [], firstSeen: new Map(), names: new Map() });

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('security_events').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

const salt = () => derivedSecret('GUARD_SALT') ?? 'sellonbay-dev-salt';
/* The address and the device id are only ever stored as this hash. */
export const hashKey = (kind: BlockKind, raw: string) => createHash('sha256').update(`${kind}:${salt()}:${raw}`).digest('hex').slice(0, 24);
/* This computer itself (and private networks) is never a person on the internet: tests, health checks and a local server all look like this, so they are not limited as one group. */
const LOCAL = /^(127\.|10\.|192\.168\.|169\.254\.|::1$|::ffff:127\.|fe80:|f[cd][0-9a-f]{2}:)/i;
/* The same mailbox in different spellings is one address: lower case, no +tag, and no dots in a Gmail name. */
export function normalizeEmail(raw: string): string {
  const [local, domain] = raw.trim().toLowerCase().split('@');
  if (!local || !domain) return raw.trim().toLowerCase();
  const base = local.split('+')[0];
  return `${domain === 'gmail.com' || domain === 'googlemail.com' ? base.replace(/\./g, '') : base}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}
const emailKey = (email: string | null | undefined) => (email && email.includes('@') ? hashKey('email', normalizeEmail(email)) : null);
export const ipKey = (ip: string) => (!ip || ip === 'unknown' || LOCAL.test(ip) ? null : hashKey('ip', ip));
const deviceKey = (d: string | null) => (d && /^[A-Za-z0-9-]{8,64}$/.test(d) ? hashKey('device', d) : null);

/* ---------- account age ---------- */
export async function isNewAccount(userId: string, now: number): Promise<boolean> {
  const limit = CONFIG.limits.newAccountDays * DAY_MS;
  if (UUID.test(userId) && (await pg())) {
    const { data } = await createAdminClient().from('profiles').select('created_at').eq('id', userId).maybeSingle();
    if (data?.created_at) return now - Date.parse(data.created_at) < limit;
  }
  // Without a database there are no real accounts, so nobody counts as new unless a test says so (seenFirst).
  const first = mem.firstSeen.get(userId);
  return first !== undefined && now - first < limit;
}
/* Test helper: pretend an account was first seen at a time. */
export const seenFirst = (userId: string, at: number) => void mem.firstSeen.set(userId, at);

/* ---------- storage ---------- */
async function record(e: Ev) {
  try {
    if (await pg()) {
      await createAdminClient()
        .from('security_events')
        .insert({ user_id: e.userId && UUID.test(e.userId) ? e.userId : null, action: e.action, ip_hash: e.ip, device_hash: e.device, created_at: new Date(e.at).toISOString() });
    } else {
      mem.events.push(e);
      if (mem.events.length > 20_000) mem.events.splice(0, 5_000);
    }
  } catch {
    // Writing the trail must never break the thing that is being guarded.
  }
}
async function eventsSince(since: number, filter: { ip?: string; device?: string; action?: string } = {}): Promise<Ev[]> {
  if (await pg()) {
    let q = createAdminClient()
      .from('security_events')
      .select('user_id, action, ip_hash, device_hash, created_at')
      .gte('created_at', new Date(since).toISOString())
      .order('created_at', { ascending: false })
      .limit(5000);
    if (filter.ip) q = q.eq('ip_hash', filter.ip);
    if (filter.device) q = q.eq('device_hash', filter.device);
    if (filter.action) q = q.eq('action', filter.action);
    const { data } = await q;
    return (data ?? []).map((r) => ({ userId: r.user_id, action: r.action, ip: r.ip_hash, device: r.device_hash, at: Date.parse(r.created_at) }));
  }
  return mem.events.filter((e) => e.at >= since && (!filter.ip || e.ip === filter.ip) && (!filter.device || e.device === filter.device) && (!filter.action || e.action === filter.action));
}

/* ---------- blocks ---------- */
export async function isBlocked(ip: string | null, device: string | null, email: string | null = null): Promise<boolean> {
  const keys = [ip && (['ip', ip] as const), device && (['device', device] as const), email && (['email', email] as const)].filter(Boolean) as (readonly [BlockKind, string])[];
  if (!keys.length) return false;
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('blocks')
      .select('kind, key')
      .is('lifted_at', null)
      .in(
        'key',
        keys.map((k) => k[1]),
      );
    return (data ?? []).some((b) => keys.some(([kind, key]) => b.kind === kind && b.key === key));
  }
  return mem.blocks.some((b) => !b.liftedAt && keys.some(([kind, key]) => b.kind === kind && b.key === key));
}

export type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

export async function blockKey(adminId: string | null, kind: BlockKind, key: string, reason: string): Promise<Result> {
  if (!/^[0-9a-f]{24}$/.test(key)) return fail(400, 'That is not a connection or device key.');
  const why = reason.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (why.length > 500) return fail(400, 'Keep the reason under 500 characters.');
  if (await pg()) {
    const { error } = await createAdminClient().from('blocks').insert({ kind, key, reason: why, created_by: adminId });
    if (error) return error.code === '23505' ? fail(409, 'That is already blocked.') : fail(500, 'Could not save the block.');
  } else {
    if (mem.blocks.some((b) => !b.liftedAt && b.kind === kind && b.key === key)) return fail(409, 'That is already blocked.');
    mem.blocks.push({ id: crypto.randomUUID(), kind, key, reason: why, createdAt: Date.now() });
  }
  await audit(adminId, 'security_block', 'block', key, { kind, reason: why });
  return { ok: true };
}

/* Blocks an email address (stored as a hash of its normal form). Quietly does nothing if it is already blocked. */
export async function blockEmail(adminId: string | null, email: string, reason: string): Promise<Result> {
  if (!email.includes('@') || email.length > 200) return fail(400, 'That does not look like an email address.');
  const r = await blockKey(adminId, 'email', hashKey('email', normalizeEmail(email)), reason);
  return r.ok || r.status === 409 ? { ok: true } : r;
}

export async function liftBlock(adminId: string | null, id: string, note: string): Promise<Result> {
  const why = note.trim();
  if (why.length < 5) return fail(400, 'Write why (at least 5 characters). It goes in the audit log.');
  if (await pg()) {
    const { data } = await createAdminClient().from('blocks').update({ lifted_at: new Date().toISOString(), lifted_by: adminId }).eq('id', id).is('lifted_at', null).select('kind, key');
    if (!data?.length) return fail(404, 'No active block like that.');
    await audit(adminId, 'security_unblock', 'block', data[0].key, { kind: data[0].kind, note: why });
    return { ok: true };
  }
  const b = mem.blocks.find((x) => x.id === id && !x.liftedAt);
  if (!b) return fail(404, 'No active block like that.');
  b.liftedAt = Date.now();
  await audit(adminId, 'security_unblock', 'block', b.key, { kind: b.kind, note: why });
  return { ok: true };
}

export async function activeBlocks(): Promise<Block[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('blocks').select('id, kind, key, reason, created_at').is('lifted_at', null).order('created_at', { ascending: false }).limit(200);
    return (data ?? []).map((b) => ({ id: b.id, kind: b.kind, key: b.key, reason: b.reason, createdAt: Date.parse(b.created_at) }));
  }
  return mem.blocks.filter((b) => !b.liftedAt).map(({ liftedAt: _l, ...b }) => b);
}

/* ---------- the guard ---------- */
export const limitText = (fresh: boolean) =>
  fresh ? `New accounts have lower limits for their first ${CONFIG.limits.newAccountDays} days. Try again later.` : 'You are doing this very fast. Wait a while and try again.';

export async function check(action: Action, s: Subject, now = Date.now()): Promise<Verdict> {
  const ip = ipKey(s.ip);
  const device = deviceKey(s.device);
  const email = emailKey(s.email);
  if (await isBlocked(ip, device, email)) {
    await record({ userId: s.userId, action: 'blocked_try', ip, device, at: now });
    return { ok: false, status: 403, error: BLOCKED_TEXT };
  }
  const cfg = CONFIG.limits.actions[action];
  const windowMs = cfg.hours * HOUR_MS;
  const fresh = s.userId ? await isNewAccount(s.userId, now) : false;
  const userMax = fresh ? cfg.newMax : cfg.perUser;
  const userOk = !s.userId || userMax <= 0 || (await limit(`g:${action}:u:${s.userId}`, userMax, windowMs, now));
  const ipOk = !ip || cfg.perIp <= 0 || (await limit(`g:${action}:ip:${ip}`, cfg.perIp, windowMs, now));
  const emailOk = !email || cfg.perEmail <= 0 || (await limit(`g:${action}:e:${email}`, cfg.perEmail, windowMs, now));
  if (!userOk || !ipOk || !emailOk) {
    await record({ userId: s.userId, action: `limit:${action}`, ip, device, at: now });
    await alertBurst(ip, now);
    return { ok: false, status: 429, error: limitText(fresh && !userOk) };
  }
  await record({ userId: s.userId, action, ip, device, at: now });
  if (s.userId) await alertCluster(ip, device, now);
  return { ok: true };
}

/* Many different accounts on one connection or device in a day: tell the admins (once a day per key). They decide; nothing is blocked by itself. */
async function alertCluster(ip: string | null, device: string | null, now: number) {
  const since = now - CONFIG.limits.cluster.hours * HOUR_MS;
  for (const [kind, key] of [
    ['ip', ip],
    ['device', device],
  ] as const) {
    if (!key) continue;
    const people = new Set((await eventsSince(since, kind === 'ip' ? { ip: key } : { device: key })).filter((e) => e.userId).map((e) => e.userId));
    if (people.size >= CONFIG.limits.cluster.accounts)
      await notifyAdmins(
        'abuse_alert',
        { what: `${people.size} accounts on one ${kind === 'ip' ? 'connection' : 'device'}`, detail: `Look at Security in the admin dashboard (${kind} ${key.slice(0, 8)}).` },
        `cluster:${kind}:${key}:${new Date(now).toISOString().slice(0, 10)}`,
      );
  }
}

/* One connection that keeps running into the limits: tell the admins (once an hour per connection). */
async function alertBurst(ip: string | null, now: number) {
  if (!ip) return;
  const since = now - CONFIG.limits.burst.hours * HOUR_MS;
  const hits = (await eventsSince(since, { ip })).filter((e) => e.action.startsWith('limit:')).length;
  if (hits >= CONFIG.limits.burst.hits)
    await notifyAdmins(
      'abuse_alert',
      { what: 'one connection keeps hitting the limits', detail: `${hits} refused requests in ${CONFIG.limits.burst.hours} hour (connection ${ip.slice(0, 8)}). See Security.` },
      `burst:${ip}:${new Date(now).toISOString().slice(0, 13)}`,
    );
}

/* ---------- for the admin page ---------- */
const nameOf = async (ids: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  if (await pg()) {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        ids.filter((i) => UUID.test(i)),
      );
    for (const r of data ?? []) out.set(r.id, r.full_name || '(no name)');
  }
  for (const id of ids) if (!out.has(id)) out.set(id, mem.names.get(id) ?? id.slice(0, 8));
  return out;
};

/* Connections and devices that several accounts used inside the window, most accounts first. */
export async function clusters(now = Date.now()): Promise<Cluster[]> {
  const evs = await eventsSince(now - CONFIG.limits.cluster.hours * HOUR_MS);
  const groups = new Map<string, { kind: ClusterKind; key: string; ids: Set<string>; last: number }>();
  for (const e of evs) {
    if (!e.userId) continue;
    for (const [kind, key] of [
      ['ip', e.ip],
      ['device', e.device],
    ] as const) {
      if (!key) continue;
      const g = groups.get(kind + key) ?? { kind, key, ids: new Set<string>(), last: 0 };
      g.ids.add(e.userId);
      g.last = Math.max(g.last, e.at);
      groups.set(kind + key, g);
    }
  }
  const multi = [...groups.values()]
    .filter((g) => g.ids.size >= 2)
    .sort((a, b) => b.ids.size - a.ids.size || b.last - a.last)
    .slice(0, 50);
  const names = await nameOf([...new Set(multi.flatMap((g) => [...g.ids]))]);
  const blocked = await activeBlocks();
  return multi.map((g) => ({
    kind: g.kind,
    key: g.key,
    last: g.last,
    accounts: [...g.ids].map((id) => ({ id, name: names.get(id) ?? id.slice(0, 8) })),
    blocked: blocked.some((b) => b.kind === g.kind && b.key === g.key),
  }));
}

/* Connections that were refused by a limit in the last day, with what they tried. */
export async function recentLimitHits(now = Date.now()): Promise<LimitHit[]> {
  const evs = (await eventsSince(now - DAY_MS)).filter((e) => (e.action.startsWith('limit:') || e.action === 'blocked_try') && e.ip);
  const by = new Map<string, LimitHit>();
  for (const e of evs) {
    const h = by.get(e.ip!) ?? { ipHash: e.ip!, actions: {}, total: 0, last: 0, blocked: false };
    const a = e.action.replace('limit:', '');
    h.actions[a] = (h.actions[a] ?? 0) + 1;
    h.total++;
    h.last = Math.max(h.last, e.at);
    by.set(e.ip!, h);
  }
  const blocked = await activeBlocks();
  return [...by.values()]
    .map((h) => ({ ...h, blocked: blocked.some((b) => b.kind === 'ip' && b.key === h.ipHash) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);
}

/* Old events are deleted after CONFIG.limits.keepDays. Called by the daily job. */
export async function purgeSecurityEvents(now = Date.now()): Promise<number> {
  const cutoff = now - CONFIG.limits.keepDays * DAY_MS;
  if (await pg()) {
    const { data } = await createAdminClient().from('security_events').delete().lt('created_at', new Date(cutoff).toISOString()).select('id');
    return data?.length ?? 0;
  }
  const before = mem.events.length;
  mem.events = mem.events.filter((e) => e.at >= cutoff);
  return before - mem.events.length;
}

/* ---------- the door used by routes and server actions ---------- */

/*
 * Call at the top of a write route or server action: `const g = await guard('order', userId); if (!g.ok) return fail(g.status, g.error)`.
 * Reads the connection and the device cookie itself, so every caller stays one line.
 */
export async function guard(action: Action, userId: string | null = null, opts: { email?: string | null } = {}): Promise<Verdict> {
  const { headers, cookies } = await import('next/headers');
  const [h, c] = await Promise.all([headers(), cookies()]);
  return check(action, { userId, ip: clientAddress(h), device: c.get(DEVICE_COOKIE)?.value ?? null, email: opts.email ?? (await sessionEmail(userId)) });
}

/*
 * The signed-in person's email, so a blocked mailbox is refused on every guarded action and not only in our sign-in form
 * (an account can also be made by calling Supabase directly with the public key, which skips that form).
 */
async function sessionEmail(userId: string | null): Promise<string | null> {
  if (!userId || !UUID.test(userId) || !(await pg())) return null;
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  return user?.id === userId ? (user.email ?? null) : null;
}

/* After a sign-up or sign-in worked, tie the connection and device to the account so shared ones show up on the Security page. */
export async function noteAccount(userId: string, action: 'signup' | 'login', now = Date.now()) {
  const { headers, cookies } = await import('next/headers');
  const [h, c] = await Promise.all([headers(), cookies()]);
  const ip = ipKey(clientAddress(h));
  const device = deviceKey(c.get(DEVICE_COOKIE)?.value ?? null);
  await record({ userId, action: `${action}_ok`, ip, device, at: now });
  if (action === 'signup') await bump('accounts', 1, now);
  await alertCluster(ip, device, now);
}
