import { CONFIG, DAY_MS } from '../config';

/*
 * Real launch prices and sales only (owner, 2026-11-08). Pure, tested.
 *  - A sale: sale price at least the minimum and below the regular price, at most 30 days, and no new sale until 30 days after the last one ended.
 *  - A launch price: only for a listing whose price never changed and that never had a sale.
 *  - The struck-through "was" price shows only when it was the lowest price the listing really had in the 30 days before the sale began (EU rule),
 *    and only when the history covers those 30 days (or starts at the listing's creation). A launch never strikes anything through.
 */
export type HistoryRow = { priceCents: number; from: number; to: number | null; fromCreation: boolean };
export type Sale = {
  id: string;
  kind: 'launch' | 'sale';
  regularCents: number;
  saleCents: number;
  startsAt: number;
  endsAt: number;
  startedAt?: number | null;
  endedAt?: number | null;
  cancelledAt?: number | null;
};
export type SaleInput = { kind: 'launch' | 'sale'; saleCents: number; startsAt: number; endsAt: number };
export const SALE_MAX_DAYS = 30;
export const SALE_GAP_DAYS = 30;

const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const day = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const live = (s: Sale) => !s.cancelledAt && !s.endedAt;
const lastEnd = (s: Sale) => s.endedAt ?? s.endsAt;

export function saleProblem(input: SaleInput, ctx: { now: number; priceCents: number; sales: Sale[]; history: HistoryRow[] }): string | null {
  const { saleCents, startsAt, endsAt, kind } = input;
  if (!Number.isInteger(saleCents) || saleCents < CONFIG.sale.priceMinCents) return `The sale price must be at least $${CONFIG.sale.priceMinCents / 100}.`;
  if (saleCents >= ctx.priceCents) return 'The sale price must be lower than the regular price.';
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return 'The end must be after the start.';
  if (startsAt < ctx.now - 5 * 60_000) return 'The start cannot be in the past.';
  if (endsAt - startsAt > SALE_MAX_DAYS * DAY_MS) return `A sale can last at most ${SALE_MAX_DAYS} days.`;
  if (ctx.sales.some(live)) return 'This listing already has a sale planned or running.';
  const done = ctx.sales.filter((s) => !s.cancelledAt);
  if (done.length) {
    const end = Math.max(...done.map(lastEnd));
    if (startsAt < end + SALE_GAP_DAYS * DAY_MS) return `A new sale can start from ${day(end + SALE_GAP_DAYS * DAY_MS)}, 30 days after the last one ended.`;
  }
  if (kind === 'launch' && (done.length > 0 || ctx.history.length > 1 || !ctx.history[0]?.fromCreation)) return 'A launch price is only for a new listing whose price never changed.';
  return null;
}

/* The lowest price in the 30 days before `start`, or null when the history does not cover those days. */
export function lowestBefore(history: HistoryRow[], start: number): number | null {
  const from = start - 30 * DAY_MS;
  const rows = history.filter((h) => h.from < start && (h.to === null || h.to > from));
  if (!rows.length) return null;
  const earliest = rows.reduce((a, b) => (a.from <= b.from ? a : b));
  if (earliest.from > from && !earliest.fromCreation) return null; // the days before our history are not known
  return Math.min(...rows.map((h) => h.priceCents));
}

export type PriceShown = { priceCents: number; wasCents?: number; badge?: 'Sale' | 'Launch'; note?: string };

export function priceShown(priceCents: number, history: HistoryRow[], sales: Sale[], now: number): PriceShown {
  const s = sales.find((x) => !x.cancelledAt && !x.endedAt && x.startedAt && x.startsAt <= now && now < x.endsAt);
  if (!s) return { priceCents };
  if (s.kind === 'launch') return { priceCents: s.saleCents, badge: 'Launch', note: `Launch price ${usd(s.saleCents)} · ${usd(s.regularCents)} from ${day(s.endsAt)}` };
  const daysLeft = Math.max(1, Math.ceil((s.endsAt - now) / DAY_MS));
  const lowest = lowestBefore(history, s.startsAt);
  return {
    priceCents: s.saleCents,
    ...(lowest !== null && lowest === s.regularCents ? { wasCents: s.regularCents } : {}),
    badge: 'Sale',
    note: `Sale ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`,
  };
}

/* What the scheduled job must do now: start sales whose time has come, end sales that are over. */
export function dueSaleSteps(sales: Sale[], now: number): { start: Sale[]; end: Sale[] } {
  return {
    start: sales.filter((s) => !s.cancelledAt && !s.endedAt && !s.startedAt && s.startsAt <= now && now < s.endsAt),
    end: sales.filter((s) => !s.cancelledAt && !s.endedAt && s.endsAt <= now),
  };
}
