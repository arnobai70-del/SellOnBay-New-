import 'server-only';
import { audit } from './admin/audit';
import { examplesAllowed } from './exampleMode';
import { CONFIG } from './config';
import { hourChoicesText, parseHourChoices } from './deliveryTime';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Settings an admin can change without a deploy: the price range of what is sold, the size from which a new buyer's order waits for a safety check,
 * the "early access" bar and the hour choices sellers get for delivery. Every change needs a reason and goes in the audit log. The defaults are in lib/config.ts; a saved value replaces its default.
 * This is how the shop starts small (for example $5 to $70) and opens up later by changing one number.
 */
export type PaymentsMode = 'beta_free' | 'live';
export type Settings = {
  paymentsMode: PaymentsMode;
  priceMinCents: number;
  priceMaxCents: number;
  holdNewBuyerMinCents: number;
  earlyAccessOn: boolean;
  earlyAccessText: string;
  showExamples: boolean;
  deliveryHoursOn: boolean;
  deliveryHourChoices: string;
  allowedCountries: string; // comma-separated ISO codes buyers may request from; empty = everywhere (owner, 2026-11-07)
  monthlyTargetCents: number; // the admin overview's monthly sales target, 0 = none (owner, 2026-11-11)
};
export type Key = keyof Settings;
export type Result = { ok: true } | { ok: false; status: number; error: string };

export const DEFAULTS: Settings = {
  paymentsMode: 'beta_free', // free beta: nothing is charged, real payment code stays behind this (owner, 2026-11-07)
  priceMinCents: CONFIG.sale.priceMinCents,
  priceMaxCents: CONFIG.sale.priceMaxCents,
  holdNewBuyerMinCents: CONFIG.risk.holdNewBuyerMinCents,
  earlyAccessOn: false,
  earlyAccessText: '',
  showExamples: true,
  deliveryHoursOn: true,
  deliveryHourChoices: hourChoicesText(CONFIG.deliveryHours.choices),
  allowedCountries: '',
  monthlyTargetCents: 0,
};
export const LABEL: Record<Key, string> = {
  paymentsMode: 'Payments mode',
  priceMinCents: 'Lowest price a product may have',
  priceMaxCents: 'Highest price of a product (with setup help or customisation added)',
  holdNewBuyerMinCents: "A new buyer's paid order of this much waits for a safety check (0 = never)",
  earlyAccessOn: 'Show the early access bar on top of every page',
  earlyAccessText: 'Words in the bar (empty = the standard words with the price range)',
  showExamples: 'Show the example listings (made-up products that show how the shop works; they cannot be bought)',
  deliveryHoursOn: 'Sellers may promise delivery in hours',
  deliveryHourChoices: 'The hour choices sellers get, like 6, 12, 18',
  allowedCountries: 'Countries buyers may order from, as two-letter codes like US, GB, DE (empty = everywhere)',
  monthlyTargetCents: 'Monthly sales target on the admin overview (0 = none)',
};
const MONEY_BOUNDS: Record<'priceMinCents' | 'priceMaxCents' | 'holdNewBuyerMinCents' | 'monthlyTargetCents', [number, number]> = {
  priceMinCents: [CONFIG.sale.priceMinCents, 100_000], // never below the $20 minimum (owner, 2026-11-07)
  priceMaxCents: [500, 1_000_000],
  holdNewBuyerMinCents: [0, 1_000_000],
  monthlyTargetCents: [0, 100_000_000],
};

/* Checks a whole set of settings. Returns the first problem in plain words, or null. */
export function problemWith(s: Settings): string | null {
  if (s.paymentsMode !== 'beta_free' && s.paymentsMode !== 'live') return 'Payments mode must be beta or live.';
  for (const [k, [lo, hi]] of Object.entries(MONEY_BOUNDS) as [keyof typeof MONEY_BOUNDS, [number, number]][]) {
    const v = s[k];
    if (!Number.isInteger(v) || v < lo || v > hi) return `${LABEL[k]}: use whole dollars from $${lo / 100} to $${hi / 100}.`;
  }
  if (s.priceMinCents >= s.priceMaxCents) return 'The lowest price must be less than the highest price.';
  if (typeof s.earlyAccessText !== 'string' || s.earlyAccessText.length > 200) return 'The words in the bar can be up to 200 characters.';
  if (typeof s.earlyAccessOn !== 'boolean') return 'The early access bar is on or off.';
  if (typeof s.showExamples !== 'boolean') return 'The example listings are shown or hidden.';
  if (typeof s.deliveryHoursOn !== 'boolean') return 'Delivery in hours is on or off.';
  const h = typeof s.deliveryHourChoices === 'string' ? parseHourChoices(s.deliveryHourChoices) : { ok: false as const, error: 'The hour choices are a list of numbers.' };
  if (!h.ok) return h.error;
  if (s.deliveryHoursOn && !h.hours.length) return 'Give at least one hour choice, or turn delivery in hours off.';
  if (typeof s.allowedCountries !== 'string' || !/^\s*([A-Z]{2}\s*(,\s*[A-Z]{2}\s*)*)?$/.test(s.allowedCountries))
    return 'Write the countries as two-letter codes separated by commas, like US, GB, DE.';
  return null;
}

/* The hours a seller may promise now (none when the admin turned hours off). A listing keeps hours it already promised (lib/deliveryTime.ts). */
export const allowedHours = (s: Settings): number[] => {
  const h = s.deliveryHoursOn ? parseHourChoices(s.deliveryHourChoices) : null;
  return h?.ok ? h.hours : [];
};

/* May a buyer from this country order? Empty list: everywhere. */
export const countryAllowed = (s: Settings, country: string) => {
  const list = s.allowedCountries
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  return !list.length || list.includes(country.toUpperCase());
};

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
  out.priceMinCents = Math.max(out.priceMinCents, CONFIG.sale.priceMinCents); // an older saved minimum cannot undercut the $20 rule, and the rest of the saved set still counts
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
  const hours = typeof next.deliveryHourChoices === 'string' ? parseHourChoices(next.deliveryHourChoices) : null;
  if (hours?.ok) next.deliveryHourChoices = hourChoicesText(hours.hours); // "36,6" is saved as "6, 36"
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
