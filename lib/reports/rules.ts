import { CONFIG, DAY_MS, HOUR_MS } from '../config';
import { split } from '../ledger';
import type { Order, OrderState } from '../orders/machine';
import { isFundedState } from '../orders/machine';

/*
 * Sales PDF reports (SellOnBay 2.0, Blueprint 8.2, Addendum 6.6, O-9, placeholder P18). Pure, tested.
 *   Super Admin, Finance   all sales, every filter
 *   seller                 own sales only: date, product, quoted amount, commission, plan, net, status. Never buyer personal data.
 *   buyer                  a receipt for one of their own orders
 * Figures come from what the order recorded (its lines, fee and the quotation's seller gross, split by the ledger's own rule), never from
 * today's listing prices, so the same filters over the same records always give the same figures.
 * At most 1,000 rows per file; a larger export is split into numbered parts. The generated files are deleted after 24 hours; the export log
 * entries and the records they came from are kept.
 */
export const ROWS_PER_FILE = CONFIG.reports.maxRowsPerPdf;
export const FILE_HOURS = CONFIG.reports.pdfKeepHours;
export const fileExpiresAt = (now: number) => now + FILE_HOURS * HOUR_MS;

export type ReportScope = 'admin' | 'seller' | 'buyer';
export type Filters = { from: string; to: string; statuses: OrderState[]; productId: string | null; sellerId: string | null; planId: string | null; ownerType: 'seller' | 'platform' | null };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/* Sales in a report: orders whose payment was verified (funded at some point), including those later refunded. */
export const SALE_STATES: readonly OrderState[] = [
  'funded',
  'release_pending',
  'in_delivery',
  'delivered',
  'accepted',
  'payout_pending',
  'paid_out',
  'disputed',
  'fix_requested',
  'overdue',
  'refunded',
];

/* Cleans what the form sends. A seller's export is always forced to their own sales, whatever was asked. */
export function cleanFilters(raw: Record<string, unknown>, scope: ReportScope, me: string, now = Date.now()): { ok: true; value: Filters } | { ok: false; error: string } {
  const today = new Date(now).toISOString().slice(0, 10);
  const from = typeof raw.from === 'string' && DAY.test(raw.from) ? raw.from : new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
  const to = typeof raw.to === 'string' && DAY.test(raw.to) ? raw.to : today;
  if (from > to) return { ok: false, error: 'The start date is after the end date.' };
  if (Date.parse(to) - Date.parse(from) > CONFIG.reports.maxRangeDays * DAY_MS) return { ok: false, error: `Choose at most ${CONFIG.reports.maxRangeDays} days.` };
  const statuses = (Array.isArray(raw.statuses) ? raw.statuses : typeof raw.statuses === 'string' && raw.statuses ? [raw.statuses] : []).filter((s): s is OrderState =>
    SALE_STATES.includes(s as OrderState),
  );
  const id = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const ownerType = raw.ownerType === 'seller' || raw.ownerType === 'platform' ? raw.ownerType : null;
  return {
    ok: true,
    value: {
      from,
      to,
      statuses,
      productId: id(raw.productId),
      sellerId: scope === 'seller' ? me : id(raw.sellerId),
      planId: scope === 'seller' ? null : id(raw.planId),
      ownerType: scope === 'seller' ? null : ownerType,
    },
  };
}

export type SalesRow = { date: string; order: string; product: string; status: string; quotedCents: number; commissionCents: number; netCents: number; refundedCents: number; plan: string };

/* The order's own recorded money, split exactly as the ledger splits it. Platform-owned products have no seller share. */
export function rowOf(o: Order, planName: string): SalesRow {
  const s = split(o.lines, o.feeCents, o.sellerGrossCents);
  return {
    date: new Date(o.fundedAt ?? o.createdAt).toISOString().slice(0, 10),
    order: o.id.slice(0, 8).toUpperCase(),
    product: o.title,
    status: o.state.replace(/_/g, ' '),
    quotedCents: s.total,
    commissionCents: s.platform,
    netCents: s.sellerNet,
    refundedCents: o.refundedCents,
    plan: planName,
  };
}

/* Which orders a report covers, oldest first (by payment date, then id, so the order of rows never changes between two exports). */
export function selectOrders(all: Order[], f: Filters, scope: ReportScope, me: string): Order[] {
  return all
    .filter((o) => isFundedState(o.state) || o.state === 'refunded')
    .filter((o) => !!o.fundedAt)
    .filter((o) => (scope === 'seller' ? o.sellerId === me : true))
    .filter((o) => {
      const d = new Date(o.fundedAt!).toISOString().slice(0, 10);
      return d >= f.from && d <= f.to;
    })
    .filter((o) => !f.statuses.length || f.statuses.includes(o.state))
    .filter((o) => !f.productId || o.productId === f.productId)
    .filter((o) => !f.sellerId || o.sellerId === f.sellerId)
    .filter((o) => !f.planId || o.feePlanId === f.planId)
    .filter((o) => !f.ownerType || (f.ownerType === 'platform' ? !o.sellerId : !!o.sellerId))
    .sort((a, b) => a.fundedAt! - b.fundedAt! || a.id.localeCompare(b.id));
}

export function parts<T>(rows: T[], size = ROWS_PER_FILE): T[][] {
  if (!rows.length) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export function totals(rows: SalesRow[]) {
  return rows.reduce((t, r) => ({ quoted: t.quoted + r.quotedCents, commission: t.commission + r.commissionCents, net: t.net + r.netCents, refunded: t.refunded + r.refundedCents }), {
    quoted: 0,
    commission: 0,
    net: 0,
    refunded: 0,
  });
}

/* pdf-lib's standard fonts only draw Latin-1; anything else becomes "?" so a name in another script never breaks the file. */
export const latin1 = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
export const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/* The export form's default range (the last 30 days) and whether a generated file is gone. */
export const defaultRange = (now = Date.now()) => ({ from: new Date(now - 30 * DAY_MS).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10) });
export const fileGone = (e: { deletedAt: number | null; expiresAt: number }, now = Date.now()) => !!e.deletedAt || now > e.expiresAt;
