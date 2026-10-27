import 'server-only';
import { isFlagOn } from '../featureFlags';
import { FLAGS } from '../featureFlagRegistry';
import { notify, notifyAdmins } from '../notify';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import { enabledOAuth } from '../supabase/oauth';
import {
  intentProblem,
  isSocialProvider,
  LINK_INTENT_MINUTES,
  linkProblem,
  latestProvider,
  PROVIDERS,
  signInDecision,
  socialIdentities,
  unexpectedIdentities,
  type Identity,
  type Intent,
  type SocialProvider,
} from './social';

/*
 * Social sign-in on the server (migration 0066). See lib/auth/social.ts for what this can and cannot guarantee: these are extra layers, not a
 * replacement for automatic linking being off at the Supabase Auth level (blocker B-7). Postgres when there, memory otherwise.
 */
type LinkAction = 'linked' | 'unlinked' | 'refused' | 'unexpected_identity' | 'admin_social_refused' | 'signin_refused';
type LinkEvent = { userId: string | null; provider: string; action: LinkAction; detail: string; at: number };
const g = globalThis as { __linkMem?: { intents: Map<string, Intent>; events: LinkEvent[] } };
const mem: { intents: Map<string, Intent>; events: LinkEvent[] } = (g.__linkMem ??= { intents: new Map(), events: [] });
const uuid = (id: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
async function pg(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  const { error } = await createAdminClient().from('link_intents').select('id').limit(1);
  return !error;
}

/* A provider is usable only when its flag is on and not locked by a blocker. Locked flags stay off whatever is saved. */
export async function providerOn(p: SocialProvider): Promise<boolean> {
  const def = FLAGS[PROVIDERS[p].flag] as { locked?: string };
  if (p !== 'apple' && def.locked) return false;
  return isFlagOn(PROVIDERS[p].flag);
}

/* The buttons on the sign-in page: switched on in Supabase AND by SellOnBay. Apple is never a main button (Addendum 3.5). */
export async function signInOptions(): Promise<{ providers: SocialProvider[]; appleExisting: boolean }> {
  const enabled = (await enabledOAuth()) as string[];
  const providers: SocialProvider[] = [];
  for (const p of ['google', 'azure', 'github', 'gitlab'] as const) if (enabled.includes(p) && (await providerOn(p))) providers.push(p);
  return { providers, appleExisting: enabled.includes('apple') && (await providerOn('apple')) };
}

export async function logLink(userId: string | null, provider: string, action: LinkAction, detail = ''): Promise<void> {
  const ev = { userId, provider: provider.slice(0, 40), action, detail: detail.slice(0, 500), at: Date.now() };
  try {
    if (!(await pg())) return void mem.events.push(ev);
    await createAdminClient()
      .from('account_link_events')
      .insert({ user_id: uuid(userId), provider: ev.provider, action, detail: ev.detail });
  } catch {
    // the refusal itself still happens
  }
}
export async function linkedProviders(userId: string): Promise<string[]> {
  if (!(await pg())) return mem.events.filter((e) => e.userId === userId && e.action === 'linked').map((e) => e.provider);
  const { data } = await createAdminClient().from('account_link_events').select('provider').eq('user_id', userId).eq('action', 'linked');
  return (data ?? []).map((r) => r.provider as string);
}

export async function createIntent(userId: string, provider: SocialProvider, now = Date.now()): Promise<Intent> {
  const it: Intent = { id: crypto.randomUUID(), userId, provider, createdAt: now, expiresAt: now + LINK_INTENT_MINUTES * 60_000, usedAt: null };
  if (!(await pg())) mem.intents.set(it.id, it);
  else {
    const { error } = await createAdminClient()
      .from('link_intents')
      .insert({ id: it.id, user_id: userId, provider, created_at: new Date(now).toISOString(), expires_at: new Date(it.expiresAt).toISOString() });
    if (error) throw new Error('Could not start linking.');
  }
  return it;
}
async function getIntent(id: string): Promise<Intent | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (!(await pg())) return mem.intents.get(id) ?? null;
  const { data: r } = await createAdminClient().from('link_intents').select('*').eq('id', id).maybeSingle();
  return r ? { id: r.id, userId: r.user_id, provider: r.provider, createdAt: Date.parse(r.created_at), expiresAt: Date.parse(r.expires_at), usedAt: r.used_at ? Date.parse(r.used_at) : null } : null;
}
/* Uses an intent once; false if somebody used it first. */
async function consumeIntent(it: Intent, now: number): Promise<boolean> {
  if (!(await pg())) {
    const cur = mem.intents.get(it.id);
    if (!cur || cur.usedAt) return false;
    mem.intents.set(it.id, { ...cur, usedAt: now });
    return true;
  }
  const { data } = await createAdminClient()
    .from('link_intents')
    .update({ used_at: new Date(now).toISOString() })
    .eq('id', it.id)
    .is('used_at', null)
    .select('id');
  return !!data?.length;
}

/* Starts a link from account settings (the route has the session and the authentication methods with their times). */
export async function startLink(
  u: { id: string; role: string; amr: { method: string; timestamp: number }[] },
  provider: string,
  now = Date.now(),
): Promise<{ ok: true; intent: Intent } | { ok: false; error: string }> {
  const on = isSocialProvider(provider) ? await providerOn(provider) : false;
  const problem = linkProblem({ role: u.role, provider, providerOn: on, amr: u.amr, now });
  if (problem) {
    await logLink(u.id, provider, u.role === 'admin' ? 'admin_social_refused' : 'refused', problem);
    return { ok: false, error: problem };
  }
  return { ok: true, intent: await createIntent(u.id, provider as SocialProvider, now) };
}

/*
 * Runs in /auth/callback after the code is exchanged. Refuses (the caller signs the session out) when: an admin account arrives through a
 * social identity (O-7), the provider is switched off, Apple would make a new account, a link has no valid intent, or a social identity is on
 * the account that was never linked through an intent. Returns what happened so the caller can redirect.
 */
export async function callbackGuard(
  u: { id: string; role: string; identities: Identity[]; createdAt: number; email?: string | null },
  linkIntentId: string | null,
  now = Date.now(),
): Promise<{ ok: true; linked?: SocialProvider } | { ok: false; message: string }> {
  const provider = latestProvider(u.identities);
  if (linkIntentId) {
    const it = await getIntent(linkIntentId);
    const problem = intentProblem(it, { userId: u.id, provider: provider ?? '', now });
    // A provider switched off between the start and the callback links nothing; Apple is never added (Addendum 3.5).
    if (problem || !it || it.provider === 'apple' || !(await providerOn(it.provider)) || !(await consumeIntent(it, now))) {
      await logLink(u.id, provider ?? 'unknown', 'refused', `link without a valid intent: ${problem ?? 'used'}`);
      await notifyAdmins('request_update', { title: 'Account security', note: 'A sign-in link was refused because it had no valid intent.' });
      return { ok: false, message: 'Linking did not work. Start again from your account settings.' };
    }
    await logLink(u.id, it.provider, 'linked');
    await notify(u.id, 'request_update', { title: 'your account', note: `${PROVIDERS[it.provider].label} sign-in was linked to your SellOnBay account. If this was not you, contact Support.` });
    return { ok: true, linked: it.provider };
  }
  const d = signInDecision({ provider, role: u.role, providerOn: isSocialProvider(provider) ? await providerOn(provider) : false, newAccount: now - u.createdAt < 5 * 60_000 });
  if (!d.ok) {
    await logLink(u.id, provider ?? 'unknown', d.reason === 'admin_social' ? 'admin_social_refused' : 'signin_refused', d.reason);
    if (d.reason === 'admin_social') await notifyAdmins('request_update', { title: 'Account security', note: 'An admin account tried to sign in with a social login. It was refused.' });
    return {
      ok: false,
      message: d.reason === 'admin_social' ? 'Admin accounts sign in with password and authenticator code only.' : 'That sign-in method is not available. Use your email and password.',
    };
  }
  const odd = unexpectedIdentities(u.identities, await linkedProviders(u.id));
  if (odd.length) {
    await logLink(u.id, odd.join(','), 'unexpected_identity', 'identity present without a link intent');
    await notifyAdmins('request_update', { title: 'Account security', note: 'A sign-in identity appeared on an account without the secure linking flow. The session was refused.' });
    return { ok: false, message: 'That sign-in did not work. Contact Support if this keeps happening.' };
  }
  return { ok: true };
}

/* Scheduled check (T6): any admin account holding a non-email identity raises an alert. Reads only ids and providers. */
export async function adminIdentityCheck(): Promise<number> {
  if (!supabaseConfigured) return 0;
  try {
    const db = createAdminClient();
    const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin').limit(200);
    let found = 0;
    for (const a of admins ?? []) {
      const { data } = await db.auth.admin.getUserById(a.id as string);
      if (socialIdentities((data.user?.identities ?? []) as Identity[]).length) {
        found++;
        await logLink(a.id as string, 'social', 'admin_social_refused', 'scheduled check found a social identity on an admin account');
      }
    }
    if (found)
      await notifyAdmins('request_update', { title: 'Account security', note: `${found} admin account(s) hold a social sign-in. Admin sessions through them are refused; remove the identity.` });
    return found;
  } catch {
    return 0;
  }
}
