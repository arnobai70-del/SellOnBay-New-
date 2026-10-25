import 'server-only';
import { audit } from './admin/audit';
import { examplesAllowed } from './exampleMode';
import { CONFIG } from './config';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Settings an admin can change without a deploy: the price range of what is sold, the size from which a new buyer's order waits for a safety check,
 * and the "early access" bar. Every change needs a reason and goes in the audit log. The defaults are in lib/config.ts; a saved value replaces its default.
 * This is how the shop starts small (for example $5 to $70) and opens up later by changing one number.
 */
export type Settings = { priceMinCents: number; priceMaxCents: number; holdNewBuyerMinCents: number; earlyAccessOn: boolean; earlyAccessText: string; showExamples: boolean };
export type Key = keyof Settings;
export type Result = { ok: true } | { ok: false; status: number; error: string };

export const DEFAULTS: Settings = {
  priceMinCents: CONFIG.sale.priceMinCents,
  priceMaxCents: CONFIG.sale.priceMaxCents,
  holdNewBuyerMinCents: CONFIG.risk.holdNewBuyerMinCents,
  earlyAccessOn: false,
  earlyAccessText: '',
  showExamples: true,
};
export const LABEL: Record<Key, string> = {
  priceMinCents: 'Lowest price a product may have',
  priceMaxCents: 'Highest price of a product (with setup help or customisation added)',
  holdNewBuyerMinCents: "A new buyer's paid order of this much waits for a safety check (0 = never)",
  earlyAccessOn: 'Show the early access bar on top of every page',
  earlyAccessText: 'Words in the bar (empty = the standard words with the price range)',
  showExamples: 'Show the example listings (made-up products that show how the shop works; they cannot be bought)',
};
const MONEY_BOUNDS: Record<'priceMinCents' | 'priceMaxCents' | 'holdNewBuyerMinCents', [number, number]> = {
  priceMinCents: [100, 100_000],
  priceMaxCents: [500, 1_000_000],
  holdNewBuyerMinCents: [0, 1_000_000],
};

/* Checks a whole set of settings. Returns the first problem in plain words, or null. */
export function problemWith(s: Settings): string | null {
  for (const [k, [lo, hi]] of Object.entries(MONEY_BOUNDS) as [keyof typeof MONEY_BOUNDS, [number, number]][]) {
    const v = s[k];
    if (!Number.isInteger(v) || v < lo || v > hi) return `${LABEL[k]}: use whole dollars from $${lo / 100} to $${hi / 100}.`;
  }
  if (s.priceMinCents >= s.priceMaxCents) return 'The lowest price must be less than the highest price.';
  if (typeof s.earlyAccessText !== 'string' || s.earlyAccessText.length > 200) return 'The words in the bar can be up to 200 characters.';
  if (typeof s.earlyAccessOn !== 'boolean') return 'The early access bar is on or off.';
  if (typeof s.showExamples !== 'boolean') return 'The example listings are shown or hidden.';
  return null;
}

/* The standard words of the bar, with the price range worked out from the settings. */
export const barText = (s: Settings) =>
  s.earlyAccessText.trim() || `Early access: we are opening in small steps, so for now every product costs between $${s.priceMinCents / 100} and $${s.priceMaxCents / 100}.`;

const mem: { saved: Partial<Settings> } = ((globalThis as { __settingsMem?: { saved: Partial<Settings> } }).__settingsMem ??= { saved: {} });
/* Kept on globalThis: the page, the API route and the admin page are separate bundles, and a change made in one must be seen by the others at once. */
const g = globalThis as { __settingsCache?: { at: number; value: Settings } };
let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('app_settings').select('key').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

async function load(): Promise<Settings> {
  const out: Settings = { ...DEFAULTS };
  // When the database cannot be reached the shop runs on the defaults instead of failing every page; saving still fails loudly.
  const saved: Partial<Settings> = (await pg().catch(() => false))
    ? Object.fromEntries(((await createAdminClient().from('app_settings').select('key, value')).data ?? []).map((r) => [r.key, r.value]))
    : mem.saved;
  for (const k of Object.keys(DEFAULTS) as Key[]) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) (out as Record<string, unknown>)[k] = saved[k];
  const result = problemWith(out) ? { ...DEFAULTS } : out; // a bad saved set never takes the shop down
  // The made-up examples are gone from a live site whatever is saved (lib/exampleMode.ts).
  return examplesAllowed() ? result : { ...result, showExamples: false };
}

/* The current settings. Read on every request that needs them, with a short cache so the database is not asked each time. */
export async function getSettings(now = Date.now()): Promise<Settings> {
  if (g.__settingsCache && now - g.__settingsCache.at < 3_000) return g.__settingsCache.value;
  const value = await load();
  g.__settingsCache = { at: now, value };
  return value;
}
export const forgetSettings = () => {
  g.__settingsCache = undefined;
};

/* Changes one or more settings together. A reason is required. The result is checked as a whole before anything is saved. */
export async function setSettings(adminId: string | null, patch: Partial<Settings>, reason: string): Promise<Result> {
  const why = reason.trim();
  if (why.length < 5) return { ok: false, status: 400, error: 'Write why (at least 5 characters). It goes in the audit log.' };
  if (why.length > 500) return { ok: false, status: 400, error: 'Keep the reason under 500 characters.' };
  const keys = (Object.keys(patch) as Key[]).filter((k) => k in DEFAULTS && patch[k] !== undefined);
  if (!keys.length) return { ok: false, status: 400, error: 'Nothing to change.' };
  forgetSettings();
  const before = await getSettings();
  const next = { ...before, ...Object.fromEntries(keys.map((k) => [k, patch[k]])) } as Settings;
  const bad = problemWith(next);
  if (bad) return { ok: false, status: 400, error: bad };
  const changed = keys.filter((k) => before[k] !== next[k]);
  if (!changed.length) return { ok: false, status: 409, error: 'That is already the current value.' };
  if (await pg()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert(changed.map((k) => ({ key: k, value: next[k], changed_by: adminId, changed_at: new Date().toISOString() })));
    if (error) return { ok: false, status: 500, error: 'Could not save the setting.' };
  } else for (const k of changed) (mem.saved as Record<string, unknown>)[k] = next[k];
  forgetSettings();
  await audit(adminId, 'settings_changed', 'settings', changed.join(','), {
    reason: why,
    from: Object.fromEntries(changed.map((k) => [k, before[k]])),
    to: Object.fromEntries(changed.map((k) => [k, next[k]])),
  });
  return { ok: true };
}
