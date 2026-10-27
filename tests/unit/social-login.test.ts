import { describe, expect, it } from 'vitest';
import { hasSocialIdentity, intentProblem, latestProvider, linkProblem, signInDecision, unexpectedIdentities, unlinkProblem, type Identity } from '@/lib/auth/social';
import { callbackGuard, createIntent, logLink, providerOn, signInOptions, startLink } from '@/lib/auth/socialService';
import { setFlag } from '@/lib/featureFlags';

/*
 * The parts of the social sign-in plan (Addendum 3.4, S1 to S15) that can be checked without a real Supabase project. The rest (S1 to S4,
 * S7, S12 to S14 against Supabase Auth itself) need staging and stay BLOCKED (B-7); until then every provider flag is locked off.
 */
const now = Date.parse('2026-10-27T12:00:00Z');
const at = (min: number) => new Date(now - min * 60_000).toISOString();
const email: Identity = { provider: 'email', created_at: at(10_000), last_sign_in_at: at(5) };
const google = (signedInMin = 0): Identity => ({ provider: 'google', created_at: at(1), last_sign_in_at: at(signedInMin) });
const fresh = (method: string, min = 1) => ({ method, timestamp: Math.floor((now - min * 60_000) / 1000) });

describe('providers stay off until blocker B-7 clears', () => {
  it('locked flags cannot be switched on and no button shows', async () => {
    for (const k of ['login.google', 'login.microsoft', 'login.github', 'login.gitlab'] as const)
      expect(await setFlag('super-1', k, true, 'Try to switch it on.')).toMatchObject({ ok: false, status: 409 });
    for (const p of ['google', 'azure', 'github', 'gitlab'] as const) expect(await providerOn(p)).toBe(false);
    expect((await signInOptions()).providers).toEqual([]); // demo mode: Supabase is not reachable either
  });
});

describe('sign-in decisions', () => {
  it('S9 / O-7: an admin account never works through a social identity', () => {
    expect(signInDecision({ provider: 'google', role: 'admin', providerOn: true, newAccount: false })).toMatchObject({ ok: false, reason: 'admin_social' });
    expect(hasSocialIdentity([email, google()])).toBe(true);
    expect(hasSocialIdentity([email])).toBe(false);
  });
  it('a switched-off provider is refused; email always passes; Apple only for accounts that already existed (S15, 3.5)', () => {
    expect(signInDecision({ provider: 'github', role: 'buyer', providerOn: false, newAccount: false })).toMatchObject({ ok: false, reason: 'provider_off' });
    expect(signInDecision({ provider: 'email', role: 'seller', providerOn: false, newAccount: true })).toEqual({ ok: true });
    expect(signInDecision({ provider: 'apple', role: 'buyer', providerOn: true, newAccount: true })).toMatchObject({ ok: false, reason: 'apple_new' });
    expect(signInDecision({ provider: 'apple', role: 'buyer', providerOn: true, newAccount: false })).toEqual({ ok: true });
    expect(latestProvider([email, google(0)])).toBe('google');
  });
  it('the callback refuses a switched-off provider and an admin with a social identity', async () => {
    expect(await callbackGuard({ id: 'u-1', role: 'buyer', identities: [google(0)], createdAt: now - 10 * 60_000 }, null, now)).toMatchObject({ ok: false });
    expect(await callbackGuard({ id: 'a-1', role: 'admin', identities: [email, google(0)], createdAt: now - 1e9 }, null, now)).toMatchObject({ ok: false, message: expect.stringMatching(/Admin/) });
    expect(await callbackGuard({ id: 'u-2', role: 'buyer', identities: [email], createdAt: now - 1e9 }, null, now)).toEqual({ ok: true });
  });
  it('an identity that was never linked through an intent is refused', async () => {
    const ids = [email, google(60)];
    expect(unexpectedIdentities(ids, [])).toEqual(['google']);
    expect(unexpectedIdentities(ids, ['google'])).toEqual([]);
    expect(unexpectedIdentities([google(0)], [])).toEqual([]); // the account was made with it
    // signed in by email, but a Google identity sits on the account without a link: refused
    expect(await callbackGuard({ id: 'u-3', role: 'buyer', identities: [{ ...email, last_sign_in_at: at(0) }, google(60)], createdAt: now - 1e9 }, null, now)).toMatchObject({ ok: false });
    await logLink('u-4', 'google', 'linked');
    expect(await callbackGuard({ id: 'u-4', role: 'buyer', identities: [{ ...email, last_sign_in_at: at(0) }, google(60)], createdAt: now - 1e9 }, null, now)).toEqual({ ok: true });
  });
});

describe('linking (S5, S6, S8, S11)', () => {
  it('needs a fresh sign-in, a fresh code for sellers, a switched-on provider, and never an admin', () => {
    expect(linkProblem({ role: 'admin', provider: 'google', providerOn: true, amr: [fresh('password')], now })).toMatch(/Admin/);
    expect(linkProblem({ role: 'buyer', provider: 'google', providerOn: false, amr: [fresh('password')], now })).toMatch(/not available/);
    expect(linkProblem({ role: 'buyer', provider: 'google', providerOn: true, amr: [fresh('password', 30)], now })).toMatch(/sign in again/);
    expect(linkProblem({ role: 'seller', provider: 'google', providerOn: true, amr: [fresh('password')], now })).toMatch(/authenticator/);
    expect(linkProblem({ role: 'seller', provider: 'google', providerOn: true, amr: [fresh('password'), fresh('totp')], now })).toBeNull();
    expect(linkProblem({ role: 'buyer', provider: 'apple', providerOn: true, amr: [fresh('password')], now })).toMatch(/Apple/);
  });
  it('an intent is for one user and provider, once, for ten minutes', async () => {
    const it1 = await createIntent('u-5', 'google', now);
    expect(intentProblem(it1, { userId: 'u-5', provider: 'google', now })).toBeNull();
    expect(intentProblem(it1, { userId: 'u-6', provider: 'google', now })).toBe('other_user');
    expect(intentProblem(it1, { userId: 'u-5', provider: 'github', now })).toBe('other_provider');
    expect(intentProblem(it1, { userId: 'u-5', provider: 'google', now: now + 11 * 60_000 })).toBe('expired');
    expect(intentProblem({ ...it1, usedAt: now }, { userId: 'u-5', provider: 'google', now })).toBe('used');
    expect(intentProblem(null, { userId: 'u-5', provider: 'google', now })).toBe('missing');
    // Even a valid intent links nothing while the provider is switched off; an unknown intent never links.
    expect(await callbackGuard({ id: 'u-5', role: 'buyer', identities: [email, google(0)], createdAt: now - 1e9 }, it1.id, now)).toMatchObject({ ok: false });
    expect(await callbackGuard({ id: 'u-5', role: 'buyer', identities: [email, google(0)], createdAt: now - 1e9 }, crypto.randomUUID(), now)).toMatchObject({ ok: false });
    expect(await startLink({ id: 'a-2', role: 'admin', amr: [fresh('password'), fresh('totp')] }, 'google', now)).toMatchObject({ ok: false });
    expect(await startLink({ id: 'u-7', role: 'buyer', amr: [fresh('password')] }, 'google', now)).toMatchObject({ ok: false }); // locked
  });
  it('the last sign-in method can never be removed', () => {
    expect(unlinkProblem([google()], 'google')).toMatch(/only way/);
    expect(unlinkProblem([email, google()], 'google')).toBeNull();
    expect(unlinkProblem([email], 'github')).toMatch(/not linked/);
  });
});
