import { CONFIG } from './config';

/*
 * Delivery in hours (owner, 2026-10-27). A listing promises either whole days (1 to 7, as before) or a number of hours from the choices an admin
 * allows (Admin → Settings). The hours win when they are set; the days are then kept as the hours rounded up, so filters and older screens that
 * only know days still work. Pure: the form, the server, the admin editor and the order timer all use these.
 */
export const MAX_HOURS = CONFIG.delivery.maxDays * 24;
export type DeliveryPromise = { days: number; hours?: number | null };

/* How many hours the seller has from the moment the order is funded. */
export const promiseHours = (p: DeliveryPromise) => p.hours ?? p.days * 24;
/* The whole days that cover a number of hours, inside the allowed range. */
export const daysFor = (hours: number) => Math.min(CONFIG.delivery.maxDays, Math.max(CONFIG.delivery.minDays, Math.ceil(hours / 24)));
export const validHours = (h: unknown): h is number => Number.isInteger(h) && (h as number) >= CONFIG.deliveryHours.minHours && (h as number) <= MAX_HOURS;

/* "12 hours", "1 hour", "1 day", "3 days". */
export const hoursText = (h: number) => (h === 1 ? '1 hour' : `${h} hours`);
export const deliveryText = (p: DeliveryPromise) => (p.hours ? hoursText(p.hours) : p.days === 1 ? '1 day' : `${p.days} days`);

/* The value of the delivery choice in a form: "12h" for hours, "3" for days. */
export const deliveryValue = (p: DeliveryPromise) => (p.hours ? `${p.hours}h` : String(p.days));

/* The admin's list of hour choices, saved as "6, 12, 18". Returns the sorted numbers, or a problem in plain words. Empty means no hour choices. */
export function parseHourChoices(s: string): { ok: true; hours: number[] } | { ok: false; error: string } {
  const parts = s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const hours = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  if (hours.some((h) => !validHours(h))) return { ok: false, error: `Each hour choice is a whole number from ${CONFIG.deliveryHours.minHours} to ${MAX_HOURS}.` };
  if (hours.length > CONFIG.deliveryHours.maxChoices) return { ok: false, error: `Offer at most ${CONFIG.deliveryHours.maxChoices} hour choices.` };
  return { ok: true, hours };
}
export const hourChoicesText = (hours: readonly number[]) => hours.join(', ');

/* The choices a seller sees: the allowed hours (when hours are on), then 1 to 7 days. A listing that already promises hours no longer offered keeps them. */
export function deliveryChoices(allowed: readonly number[], current?: number | null): [value: string, label: string][] {
  const hours = [...new Set([...allowed, ...(current ? [current] : [])])].sort((a, b) => a - b);
  const days = Array.from({ length: CONFIG.delivery.maxDays - CONFIG.delivery.minDays + 1 }, (_, k) => CONFIG.delivery.minDays + k);
  return [...hours.map((h) => [`${h}h`, hoursText(h)] as [string, string]), ...days.map((d) => [String(d), d === 1 ? '1 day' : `${d} days`] as [string, string])];
}

/*
 * Reads the delivery choice a form sent. Days: 1 to 7 (older forms sent words such as "1 to 2 days"; anything unreadable is 3 days, as before).
 * Hours: only one of `allowed`, or the listing's own current hours (`keep`), so a seller is never forced off a promise an admin later removed.
 */
export function readDelivery(raw: string, allowed: readonly number[], keep?: number | null): { ok: true; days: number; hours: number | null } | { ok: false; error: string } {
  const v = raw.trim().toLowerCase();
  const h = /^(\d{1,3})\s*h(ours?)?$/.exec(v);
  if (h) {
    const hours = Number(h[1]);
    if (!validHours(hours) || !(allowed.includes(hours) || hours === keep)) return { ok: false, error: 'Pick a delivery time from the list.' };
    return { ok: true, days: daysFor(hours), hours };
  }
  const n = v.startsWith('1 to ') ? Number(v.slice(5, 6)) : parseInt(v, 10);
  return { ok: true, days: Number.isInteger(n) ? Math.min(CONFIG.delivery.maxDays, Math.max(CONFIG.delivery.minDays, n)) : 3, hours: null };
}

/* Express (24 hours) is not offered on a listing promised in hours that are already within it. Listings in days keep express as before. */
export const expressHelps = (p: DeliveryPromise) => !p.hours || p.hours > CONFIG.delivery.expressHours;
