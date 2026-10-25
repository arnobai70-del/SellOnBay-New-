import 'server-only';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';

/* How much each visitor and each tool used, and the saved answers for identical inputs. Memory without a database, tables from migration 0029 with one. */
type Mem = { usage: Map<string, { count: number; tin: number; tout: number }>; cache: Map<string, { output: unknown; at: number }> };
const mem: Mem = ((globalThis as { __aiMem?: Mem }).__aiMem ??= { usage: new Map(), cache: new Map() });
const day = (now: number) => new Date(now).toISOString().slice(0, 10);
const key = (subject: string, d: string, tool: string) => `${subject}|${d}|${tool}`;
let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('ai_usage').select('subject').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  // AI quotas must never silently turn into per-process memory quotas when
  // a real database exists but the required migration is absent.
  if (!ready.ok) throw new Error('AI usage database is not ready.');
  return true;
}

export async function runsToday(subject: string, tool: string, now = Date.now()): Promise<number> {
  if (await pg()) {
    const { data, error } = await createAdminClient().from('ai_usage').select('count').eq('subject', subject).eq('day', day(now)).eq('tool', tool).maybeSingle();
    if (error) throw new Error('AI usage count is unavailable.');
    return data?.count ?? 0;
  }
  return mem.usage.get(key(subject, day(now), tool))?.count ?? 0;
}

/* Counts one run for each subject and adds its tokens to the day's total for the tool (subject "global"). */
export async function recordRun(subjects: string[], tool: string, tokensIn: number, tokensOut: number, now = Date.now()): Promise<void> {
  const d = day(now);
  for (const s of [...subjects, 'global']) {
    const add = s === 'global' ? { c: 0, i: tokensIn, o: tokensOut } : { c: 1, i: 0, o: 0 };
    if (await pg()) {
      const db = createAdminClient();
      const { data, error: readError } = await db.from('ai_usage').select('count, tokens_in, tokens_out').eq('subject', s).eq('day', d).eq('tool', tool).maybeSingle();
      if (readError) throw new Error('AI usage record cannot be read.');
      const { error: writeError } = await db
        .from('ai_usage')
        .upsert(
          { subject: s, day: d, tool, count: (data?.count ?? 0) + add.c, tokens_in: Number(data?.tokens_in ?? 0) + add.i, tokens_out: Number(data?.tokens_out ?? 0) + add.o },
          { onConflict: 'subject,day,tool' },
        );
      if (writeError) throw new Error('AI usage record cannot be saved.');
    } else {
      const k = key(s, d, tool);
      const cur = mem.usage.get(k) ?? { count: 0, tin: 0, tout: 0 };
      mem.usage.set(k, { count: cur.count + add.c, tin: cur.tin + add.i, tout: cur.tout + add.o });
    }
  }
}

/* Tokens used so far this month by every tool (or one), for the monthly budget switch. */
export async function monthTokens(now = Date.now(), tool?: string): Promise<number> {
  const prefix = day(now).slice(0, 7);
  if (await pg()) {
    let q = createAdminClient()
      .from('ai_usage')
      .select('tokens_in, tokens_out')
      .eq('subject', 'global')
      .gte('day', prefix + '-01')
      .lte('day', prefix + '-31');
    if (tool) q = q.eq('tool', tool);
    const { data, error } = await q;
    if (error) throw new Error('AI monthly usage is unavailable.');
    return (data ?? []).reduce((s, r) => s + Number(r.tokens_in) + Number(r.tokens_out), 0);
  }
  let total = 0;
  for (const [k, v] of mem.usage) {
    const [subject, d, t] = k.split('|');
    if (subject === 'global' && d.startsWith(prefix) && (!tool || t === tool)) total += v.tin + v.tout;
  }
  return total;
}

export async function cacheGet<T>(tool: string, hash: string, maxAgeMs: number, now = Date.now()): Promise<T | null> {
  if (await pg()) {
    const { data, error } = await createAdminClient().from('free_tool_cache').select('output, created_at').eq('tool', tool).eq('input_hash', hash).maybeSingle();
    if (error) throw new Error('AI cache is unavailable.');
    return data && now - Date.parse(data.created_at) <= maxAgeMs ? (data.output as T) : null;
  }
  const hit = mem.cache.get(`${tool}|${hash}`);
  return hit && now - hit.at <= maxAgeMs ? (hit.output as T) : null;
}
export async function cachePut(tool: string, hash: string, output: unknown, now = Date.now()): Promise<void> {
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('free_tool_cache')
      .upsert({ tool, input_hash: hash, output, created_at: new Date(now).toISOString() }, { onConflict: 'tool,input_hash' });
    if (error) throw new Error('AI cache could not be saved.');
  } else {
    mem.cache.set(`${tool}|${hash}`, { output, at: now });
  }
}

/**
 * Real-model inference uses these RPCs, not the legacy read/upsert counters.
 * The database function takes one transaction-level advisory lock covering
 * monthly budget and BOTH cookie/IP daily counters across application workers.
 */
export type ModelReservation = { allowed: true; id: string; left: number } |
  { allowed: false; reason: 'daily' | 'budget' };

export async function reserveModelRun(
  subjects: [string, string], tool: string, dailyLimit: number,
  monthlyBudget: number, reservedTokens: number, now = Date.now(),
): Promise<ModelReservation> {
  if (!(await pg())) throw new Error('A persistent quota database is required for billable AI.');
  if (!Number.isSafeInteger(reservedTokens) || reservedTokens <= 0 ||
      !Number.isSafeInteger(monthlyBudget) || monthlyBudget <= 0)
    throw new Error('Invalid model quota.');
  const { data, error } = await createAdminClient().rpc('ai_reserve_run', {
    p_tool: tool,
    p_cookie_subject: subjects[0],
    p_ip_subject: subjects[1],
    p_day: day(now),
    p_daily_limit: dailyLimit,
    p_monthly_budget: monthlyBudget,
    p_reserved_tokens: reservedTokens,
  });
  if (error || !data || typeof data !== 'object') throw new Error('Atomic AI quota claim failed.');
  if (data.allowed === false && (data.reason === 'daily' || data.reason === 'budget'))
    return { allowed: false, reason: data.reason };
  if (data.allowed === true && typeof data.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) &&
    Number.isSafeInteger(data.left) && data.left >= 0)
    return { allowed: true, id: data.id, left: data.left };
  throw new Error('Malformed atomic AI quota claim.');
}

export async function settleModelRun(id: string, chargedTokens: number): Promise<void> {
  if (!(await pg())) throw new Error('A persistent quota database is required to settle AI usage.');
  if (!Number.isSafeInteger(chargedTokens) || chargedTokens < 0) throw new Error('Invalid token settlement.');
  const { data, error } = await createAdminClient().rpc('ai_settle_run', {
    p_id: id,
    p_charged_tokens: chargedTokens,
  });
  if (error || data !== true) throw new Error('AI usage settlement failed; reservation remains held.');
}
