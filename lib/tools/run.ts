import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { publicProducts } from '../examples';
import { allowedAiBudget, reservedAiTokens } from '../ai/budget';
import { cacheGet, cachePut, monthTokens, recordRun, reserveModelRun, runsToday, settleModelRun, type ModelReservation } from '../ai/usage';
import { verifyTurnstile } from '../bot/turnstile';
import { CONFIG, DAY_MS } from '../config';
import { registrarLive } from '../domains';
import { aiProvider, type AiProvider } from '../providers/ai';
import { domainProvider } from '../providers/domain';
import { matchProducts } from './siteIdeas';

/*
 * The free tool, end to end (spec 10 and 11): check the input, serve a saved answer if the same question was asked in the last 30 days (free, and it
 * does not use up the visitor's runs), otherwise check the bot test, the daily caps (5 runs per visitor, counted by cookie AND by address), and the
 * monthly budget switch, then ask the model, check what comes back, look up the domain names and match products. Nothing here trusts the model's text.
 */
export const TOOL = 'site-ideas';
const answerSchema = z.object({
  ideas: z
    .array(z.object({ title: z.string().min(3).max(140), why: z.string().min(3).max(300) }))
    .min(1)
    .max(5),
  names: z
    .array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/))
    .min(1)
    .max(10),
});

export type NameCheck = { name: string; domain: string; status: 'available' | 'taken' | 'unknown' };
export type Output = {
  ideas: { title: string; why: string }[];
  names: NameCheck[];
  products: { id: string; name: string; price: number; tag: string }[];
  cached: boolean;
  live: boolean;
  left: number;
  source: 'templates' | 'model';
};
export type Result = { ok: true; data: Output } | { ok: false; status: number; error: string };

export type Deps = {
  ai: AiProvider;
  verify: (token: string | undefined, ip: string) => Promise<boolean>;
  now: () => number;
  budget: () => number;
  reserveModel?: typeof reserveModelRun;
  settleModel?: typeof settleModelRun;
};
export const defaultDeps: Deps = { ai: aiProvider(), verify: verifyTurnstile, now: () => Date.now(), budget: () => Number(process.env.AI_MONTHLY_TOKEN_BUDGET ?? 2_000_000) };

const fail = (status: number, error: string): Result => ({ ok: false, status, error });
export const normalise = (idea: string) =>
  idea
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const inputHash = (idea: string) => createHash('sha256').update(normalise(idea).toLowerCase()).digest('hex');
export const ipSubject = (ip: string) => 'ip:' + createHash('sha256').update(ip).digest('hex').slice(0, 24);

type Core = { ideas: Output['ideas']; names: string[] };

async function finish(core: Core, cached: boolean, idea: string, left: number, source: Output['source']): Promise<Result> {
  const live = registrarLive();
  const names: NameCheck[] = await Promise.all(
    core.names.map(async (name) => {
      if (!live) return { name, domain: `${name}.com`, status: 'unknown' as const };
      try {
        const hit = (await domainProvider().search(name)).find((r) => r.tld === '.com');
        return { name, domain: `${name}.com`, status: hit ? (hit.available ? ('available' as const) : ('taken' as const)) : ('unknown' as const) };
      } catch {
        return { name, domain: `${name}.com`, status: 'unknown' as const };
      }
    }),
  );
  const products = matchProducts(idea, await publicProducts()).map((p) => ({ id: p.id, name: p.name, price: p.price, tag: p.tag }));
  return { ok: true, data: { ideas: core.ideas, names, products, cached, live, left, source } };
}

export async function runSiteIdeas(i: { idea: string; cookieId: string; ip: string; token?: string }, deps: Deps = defaultDeps): Promise<Result> {
  const idea = normalise(i.idea);
  if (idea.length < 3 || idea.length > 140) return fail(400, 'Describe your business in one line, 3 to 140 characters.');
  const budget = deps.budget();
  // 0 is the emergency OFF switch (docs/DECISIONS.md), not unlimited spending.
  // A non-integer/negative/NaN budget must fail closed as well.
  if (!allowedAiBudget(budget)) return fail(503, 'This free tool is currently disabled. Browse ready-made sites instead.');
  const now = deps.now();
  const subjects = [`cookie:${i.cookieId}`, ipSubject(i.ip)];
  const source: Output['source'] = ['local', 'fake'].includes(deps.ai.name) ? 'templates' : 'model';
  let used: number;
  let hit: Core | null;
  // A cache for template results must never masquerade as an actual model result
  // if a real AI provider is enabled later.
  const hash = inputHash(`${deps.ai.name}\0${idea}`);
  try {
    used = Math.max(...(await Promise.all(subjects.map((s) => runsToday(s, TOOL, now)))));
    hit = await cacheGet<Core>(TOOL, hash, CONFIG.ai.cacheDays * DAY_MS, now);
  } catch {
    return fail(503, 'Usage verification is unavailable. Please try again later.');
  }
  const left = Math.max(0, CONFIG.ai.freeRunsPerDay - used);
  if (hit) return finish(hit, true, idea, left, source);

  if (!(await deps.verify(i.token, i.ip))) return fail(400, 'Please finish the bot check and try again.');
  if (left <= 0) return fail(429, `You used your ${CONFIG.ai.freeRunsPerDay} free runs for today. Come back tomorrow, or browse the ready-made sites now.`);
  const reserveTokens = reservedAiTokens(idea, 700);
  let reservation: ModelReservation | null = null;
  try {
    const spent = await monthTokens(now, TOOL);
    if (spent + reserveTokens > budget) return fail(503, 'This free tool is resting for the rest of the month. Browse ready-made sites instead.');
    if (source === 'model') {
      // The RPC rechecks and claims cookie, IP and global budget atomically.
      // Real inference must have a persistent DB. Local templates keep the
      // existing demo quota behavior.
      reservation = await (deps.reserveModel ?? reserveModelRun)([subjects[0], subjects[1]], TOOL, CONFIG.ai.freeRunsPerDay, budget, reserveTokens, now);
      if (!reservation.allowed) return reservation.reason === 'daily' ? fail(429, 'You have reached your free runs for today.') : fail(503, 'This free tool has reached its monthly token budget.');
    }
  } catch {
    return fail(503, 'Usage verification is unavailable. Please try again later.');
  }

  let out: Awaited<ReturnType<AiProvider['complete']>> | undefined;
  let parsed: ReturnType<typeof answerSchema.safeParse> | null = null;
  let error: Result | null = null;
  try {
    out = await deps.ai.complete({ feature: TOOL, prompt: idea, maxTokens: 700, userKey: subjects[0] });
    try {
      parsed = answerSchema.safeParse(JSON.parse(out.text));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) error = fail(502, 'The idea helper gave an answer we could not use.');
    else if (![out.tokensIn, out.tokensOut].every((n) => Number.isSafeInteger(n) && n >= 0)) error = fail(502, 'The idea helper returned invalid usage details.');
  } catch {
    error = fail(502, 'The idea helper did not answer. Please try again.');
  }

  // Provider errors may still incur charges: settle using full reserved upper
  // bound unless a successful response supplies valid reported usage.
  if (reservation?.allowed) {
    const usage = out && !error ? out.tokensIn + out.tokensOut : reserveTokens;
    try {
      await (deps.settleModel ?? settleModelRun)(reservation.id, usage);
    } catch {
      // RPC failure retains a pending reservation and blocks overspending.
      return fail(503, 'AI usage settlement is unavailable; request a usage review.');
    }
  }
  if (error) return error;
  if (!out || !parsed?.success) return fail(502, 'The idea helper returned an invalid answer.');
  try {
    if (source !== 'model') await recordRun(subjects, TOOL, out.tokensIn, out.tokensOut, now);
    await cachePut(TOOL, hash, parsed.data, now);
  } catch {
    return fail(503, 'Usage recording is unavailable. Please try again later.');
  }
  return finish(parsed.data, false, idea, reservation?.allowed ? reservation.left : left - 1, source);
}
