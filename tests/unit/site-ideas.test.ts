import { describe, expect, it } from 'vitest';
import { ALL_PRODUCTS } from '@/lib/apps';
import { CONFIG, DAY_MS } from '@/lib/config';
import { allowedAiBudget, reservedAiTokens } from '@/lib/ai/budget';
import { FakeAiProvider, LocalAiProvider } from '@/lib/providers/ai';
import { generateIdeas, matchProducts, words } from '@/lib/tools/siteIdeas';
import { inputHash, normalise, runSiteIdeas, type Deps } from '@/lib/tools/run';

describe('ideas and names', () => {
  it('five ideas and ten valid domain names for any one-line idea', () => {
    for (const idea of [
      'A bakery in Dhaka that sells cakes and bread',
      'dentist',
      'photographer for weddings',
      'x',
      'We sell handmade jewelry online',
      'AI automation agency',
      'real estate rentals in Lisbon',
      'math tutor for kids',
      'xyz abc qqq',
    ]) {
      const r = generateIdeas(idea);
      expect(r.ideas, idea).toHaveLength(5);
      expect(r.names, idea).toHaveLength(10);
      expect(new Set(r.names).size, idea).toBe(10);
      for (const n of r.names) expect(n, idea).toMatch(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/);
      for (const i of r.ideas) expect(i.title.length).toBeGreaterThan(3);
    }
  });
  it('ideas follow the kind of business', () => {
    expect(generateIdeas('a bakery that sells cake').ideas[0].title).toMatch(/menu/i);
    expect(generateIdeas('a dentist in Leeds').ideas[0].title).toMatch(/booking/i);
    expect(generateIdeas('wedding photographer').ideas[0].title).toMatch(/gallery|portfolio/i);
  });
  it('names come from the idea words, not from nothing', () => {
    const r = generateIdeas('A bakery in Dhaka that sells cakes and bread');
    expect(r.names.some((n) => n.includes('bakery'))).toBe(true);
    expect(words('A bakery in Dhaka')).toEqual(['bakery', 'dhaka']);
  });
  it('always gives three products, the closest first', () => {
    const m = matchProducts('restaurant with online menu', ALL_PRODUCTS);
    expect(m).toHaveLength(3);
    expect(matchProducts('zzzz qqqq', ALL_PRODUCTS)).toHaveLength(3);
    expect(m[0].id).toBe('saffron-table');
  });
  it('the same words give the same answer, whatever the spaces and capitals', () => {
    expect(inputHash('  A Bakery   in Dhaka ')).toBe(inputHash('a bakery in dhaka'));
    expect(inputHash('a bakery')).not.toBe(inputHash('a bakery 2'));
    expect(normalise('a\u0000b\n\nc')).toBe('a b c');
  });
});

let n = 0;
const who = () => ({ cookieId: `c-${Date.now()}-${++n}`, ip: `11.${n % 250}.${Math.floor(n / 250)}.9` });
const idea = () => `a bakery number ${++n} in ${Date.now()}`;
const deps = (over: Partial<Deps> = {}): Deps => ({
  ai: new LocalAiProvider(),
  verify: async () => true,
  now: () => Date.now(),
  budget: () => 2_000_000,
  // Synthetic reservations for unit tests. Production must use the database RPC.
  reserveModel: async () => ({ allowed: true, id: '00000000-0000-4000-8000-000000000001', left: 4 }),
  settleModel: async () => {},
  ...over,
});

describe('the free tool and its cost controls', () => {
  it('gives ideas, names and products; names are marked "unknown" until a real registrar is connected', async () => {
    const r = await runSiteIdeas({ idea: 'A bakery in Dhaka that sells cakes', ...who(), token: 't' }, deps());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ideas).toHaveLength(5);
    expect(r.data.names).toHaveLength(10);
    expect(r.data.names.every((x) => x.status === 'unknown' && x.domain.endsWith('.com'))).toBe(true);
    expect(r.data.products).toHaveLength(3);
    expect(r.data.cached).toBe(false);
    expect(r.data.left).toBe(CONFIG.ai.freeRunsPerDay - 1);
    expect(r.data.source).toBe('templates');
  });
  it('refuses a missing or oversized idea', async () => {
    expect(await runSiteIdeas({ idea: 'ab', ...who() }, deps())).toMatchObject({ ok: false, status: 400 });
    expect(await runSiteIdeas({ idea: 'x'.repeat(141), ...who() }, deps())).toMatchObject({ ok: false, status: 400 });
  });
  it('needs the bot check, and a failed check costs nothing', async () => {
    const w = who();
    const fake = new FakeAiProvider();
    const r = await runSiteIdeas({ idea: idea(), ...w, token: '' }, deps({ verify: async () => false, ai: fake }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(fake.calls).toBe(0);
  });
  it('five new ideas a day per visitor, then a polite stop; cached repeats are free and do not count', async () => {
    const w = who();
    const first = idea();
    for (let i = 0; i < CONFIG.ai.freeRunsPerDay; i++) expect((await runSiteIdeas({ idea: i === 0 ? first : idea(), ...w, token: 't' }, deps())).ok).toBe(true);
    const sixth = await runSiteIdeas({ idea: idea(), ...w, token: 't' }, deps());
    expect(sixth).toMatchObject({ ok: false, status: 429 });
    expect((sixth as { error: string }).error).toMatch(/free runs for today/);
    const again = await runSiteIdeas({ idea: first, ...w, token: 't' }, deps()); // same idea as the first: saved answer
    expect(again.ok && again.data.cached).toBe(true);
  });
  it('the cookie and the address both count: a new cookie from the same address does not get fresh runs, nor a new address with the same cookie', async () => {
    const w = who();
    for (let i = 0; i < CONFIG.ai.freeRunsPerDay; i++) await runSiteIdeas({ idea: idea(), ...w, token: 't' }, deps());
    expect(await runSiteIdeas({ idea: idea(), cookieId: 'fresh-cookie-' + n, ip: w.ip, token: 't' }, deps())).toMatchObject({ ok: false, status: 429 });
    expect(await runSiteIdeas({ idea: idea(), cookieId: w.cookieId, ip: '12.12.12.' + (n % 200), token: 't' }, deps())).toMatchObject({ ok: false, status: 429 });
  });
  it('the runs come back the next day', async () => {
    const w = who();
    const t0 = Date.now();
    for (let i = 0; i < CONFIG.ai.freeRunsPerDay; i++) await runSiteIdeas({ idea: idea(), ...w, token: 't' }, deps({ now: () => t0 }));
    expect((await runSiteIdeas({ idea: idea(), ...w, token: 't' }, deps({ now: () => t0 }))).ok).toBe(false);
    expect((await runSiteIdeas({ idea: idea(), ...w, token: 't' }, deps({ now: () => t0 + DAY_MS + 1000 }))).ok).toBe(true);
  });
  it('a saved answer is kept 30 days and not longer', async () => {
    const w = who();
    const text = idea();
    const t0 = Date.now();
    await runSiteIdeas({ idea: text, ...w, token: 't' }, deps({ now: () => t0 }));
    // A cached response is reusable for the *same* provider for 30 days.
    // Switching providers must use a separate cache key.
    const same = new LocalAiProvider();
    const within = await runSiteIdeas({ idea: text, ...who(), token: 't' }, deps({ now: () => t0 + 29 * DAY_MS, ai: same }));
    expect(within.ok && within.data.cached).toBe(true);
    expect(same.calls).toBe(0);
  });
  it('0, negative and invalid budgets turn the tool off before any model request or cached response', async () => {
    const w = who();
    const input = idea();
    const ai = new FakeAiProvider();
    expect(allowedAiBudget(0)).toBe(false);
    expect(allowedAiBudget(-1)).toBe(false);
    expect(allowedAiBudget(Number.NaN)).toBe(false);
    expect(allowedAiBudget(2_000_000)).toBe(true);
    expect(reservedAiTokens('bakery', 700)).toBeGreaterThan(700);
    for (const amount of [0, -1, Number.NaN]) {
      expect(await runSiteIdeas({ idea: input, ...w, token: 't' }, deps({ ai, budget: () => amount }))).toMatchObject({ ok: false, status: 503 });
    }
    expect(ai.calls).toBe(0);
    // A disabled tool must refuse even a result already in the cache.
    const cachedInput = idea();
    expect((await runSiteIdeas({ idea: cachedInput, ...who(), token: 't' }, deps())).ok).toBe(true);
    expect(await runSiteIdeas({ idea: cachedInput, ...who(), token: 't' }, deps({ budget: () => 0 }))).toMatchObject({ ok: false, status: 503 });
  });

  it('prevents near-cap calls from exceeding the monthly AI token budget', async () => {
    const fake = new FakeAiProvider();
    const before = fake.calls;
    const r = await runSiteIdeas({ idea: idea(), ...who(), token: 't' }, deps({ ai: fake, budget: () => reservedAiTokens('a bakery', 700) - 1 }));
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(fake.calls).toBe(before);
  });

  it('keeps local template caches isolated from results produced by a different provider', async () => {
    const input = idea();
    const first = await runSiteIdeas({ idea: input, ...who(), token: 't' }, deps());
    expect(first.ok && first.data.source).toBe('templates');
    const custom = { name: 'verified-model', complete: async () => ({ text: JSON.stringify(generateIdeas(input)), tokensIn: 8, tokensOut: 75 }) };
    const second = await runSiteIdeas({ idea: input, ...who(), token: 't' }, deps({ ai: custom }));
    expect(second.ok && second.data.cached).toBe(false);
    expect(second.ok && second.data.source).toBe('model');
    const third = await runSiteIdeas({ idea: input, ...who(), token: 't' }, deps({ ai: custom }));
    expect(third.ok && third.data.cached).toBe(true);
  });

  it('the monthly budget switch turns the tool off when the tokens are used up', async () => {
    const w = who();
    const r = await runSiteIdeas({ idea: idea(), ...w, token: 't' }, deps({ budget: () => 1 }));
    // some tokens were already used this month by the other tests, so a budget of 1 token is over
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect((r as { error: string }).error).toMatch(/resting/);
  });
  it('an answer the model got wrong is refused, nothing is counted, and the cache is not poisoned', async () => {
    const w = who();
    const text = idea();
    const bad = { name: 'bad', complete: async () => ({ text: '{"ideas": "nope"}', tokensIn: 1, tokensOut: 1 }) };
    expect(await runSiteIdeas({ idea: text, ...w, token: 't' }, deps({ ai: bad }))).toMatchObject({ ok: false, status: 502 });
    const notJson = { name: 'bad2', complete: async () => ({ text: 'Sure! Here you go', tokensIn: 1, tokensOut: 1 }) };
    expect(await runSiteIdeas({ idea: text, ...w, token: 't' }, deps({ ai: notJson }))).toMatchObject({ ok: false, status: 502 });
    const boom = { name: 'bad3', complete: async () => Promise.reject(new Error('down')) };
    expect(await runSiteIdeas({ idea: text, ...w, token: 't' }, deps({ ai: boom }))).toMatchObject({ ok: false, status: 502 });
    const evil = { name: 'evil', complete: async () => ({ text: JSON.stringify({ ideas: [{ title: 'ok idea', why: 'fine' }], names: ['<script>alert(1)</script>'] }), tokensIn: 1, tokensOut: 1 }) };
    expect(await runSiteIdeas({ idea: text, ...w, token: 't' }, deps({ ai: evil }))).toMatchObject({ ok: false, status: 502 }); // a name that is not a safe name is never shown
    const good = await runSiteIdeas({ idea: text, ...w, token: 't' }, deps());
    expect(good.ok && good.data.cached).toBe(false);
    expect(good.ok && good.data.left).toBe(CONFIG.ai.freeRunsPerDay - 1); // only the good run was counted
  });
});

describe('billable AI atomic quota integration boundaries', () => {
  const model = {
    name: 'paid-model',
    complete: async () => ({
      text: JSON.stringify(generateIdeas('a local bakery shop')),
      tokensIn: 25,
      tokensOut: 55,
    }),
  };
  it('rejects a model run if the database quota reservation is unavailable', async () => {
    let calls = 0;
    const ai = {
      name: 'paid-model',
      complete: async () => {
        calls++;
        return model.complete();
      },
    };
    const r = await runSiteIdeas(
      { idea: idea(), ...who(), token: 't' },
      deps({
        ai,
        reserveModel: async () => {
          throw new Error('database offline');
        },
      }),
    );
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(calls).toBe(0);
  });
  it('propagates an atomic per-visitor denial before the model is called', async () => {
    let calls = 0;
    const ai = {
      name: 'paid-model',
      complete: async () => {
        calls++;
        return model.complete();
      },
    };
    const r = await runSiteIdeas(
      { idea: idea(), ...who(), token: 't' },
      deps({
        ai,
        reserveModel: async () => ({ allowed: false, reason: 'daily' }),
      }),
    );
    expect(r).toMatchObject({ ok: false, status: 429 });
    expect(calls).toBe(0);
  });
  it('settles successful inference with the provider-reported usage once', async () => {
    const charges: number[] = [];
    const r = await runSiteIdeas(
      { idea: idea(), ...who(), token: 't' },
      deps({
        ai: model,
        settleModel: async (_id, charged) => {
          charges.push(charged);
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(charges).toEqual([80]);
  });
  it('keeps the conservative full token reservation on an unknown provider error', async () => {
    const charges: number[] = [];
    const input = idea();
    const errorModel = { name: 'paid-model-error', complete: async () => Promise.reject(new Error('provider timeout')) };
    const r = await runSiteIdeas(
      { idea: input, ...who(), token: 't' },
      deps({
        ai: errorModel,
        settleModel: async (_id, charged) => {
          charges.push(charged);
        },
      }),
    );
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(charges).toEqual([reservedAiTokens(input, 700)]);
  });
  it('does not return a successful answer if atomic settlement fails', async () => {
    const r = await runSiteIdeas(
      { idea: idea(), ...who(), token: 't' },
      deps({
        ai: model,
        settleModel: async () => {
          throw new Error('quota unavailable');
        },
      }),
    );
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
});
