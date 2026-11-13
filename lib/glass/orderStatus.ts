import { tx } from '../i18n/tx'; // marks English words; the screen translates them
import type { PillTone } from '@/components/glass/StatusPill';

/* How an order's state reads to its buyer, with the pill colour. Pure, tested, safe in the browser. */
const BUYER: Record<string, [string, PillTone]> = {
  draft: [tx('Draft'), 'draft'],
  awaiting_payment: [tx('Waiting for payment'), 'wait'],
  payment_review: [tx('Verifying payment'), 'wait'],
  funded: [tx('Paid into escrow'), 'info'],
  release_pending: [tx('Getting your files ready'), 'info'],
  in_delivery: [tx('Being delivered'), 'info'],
  delivered: [tx('In review'), 'info'],
  accepted: [tx('Completed'), 'ok'],
  payout_pending: [tx('Completed'), 'ok'],
  paid_out: [tx('Completed'), 'ok'],
  disputed: [tx('Problem reported'), 'bad'],
  fix_requested: [tx('Being fixed'), 'wait'],
  overdue: [tx('Late'), 'bad'],
  refunded: [tx('Refunded'), 'bad'],
  cancelled: [tx('Cancelled'), 'draft'],
  beta_requested: [tx('Waiting for review'), 'wait'],
  beta_approved: [tx('Approved'), 'ok'],
  beta_declined: [tx('Declined'), 'bad'],
};
export const buyerStatus = (state: string): { label: string; tone: PillTone } => {
  const [label, tone] = BUYER[state] ?? [state.replace(/_/g, ' '), 'draft'];
  return { label, tone };
};

/* Which tab of "Orders & payments" an order belongs to. */
export const ORDER_TABS = ['all', 'progress', 'done', 'refunded'] as const;
export type OrderTab = (typeof ORDER_TABS)[number];
export function orderTab(state: string): Exclude<OrderTab, 'all'> {
  if (['accepted', 'payout_pending', 'paid_out', 'beta_approved'].includes(state)) return 'done';
  if (['refunded', 'cancelled', 'beta_declined'].includes(state)) return 'refunded';
  return 'progress';
}

/* Orders whose files the buyer may download now. The server checks again on every link. */
export const hasFiles = (state: string) => ['beta_approved', 'delivered', 'accepted', 'payout_pending', 'paid_out', 'disputed', 'fix_requested'].includes(state);

/* "Nov 7" in the viewer's own time zone. */
export const shortDate = (ms: number, timeZone?: string) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) });
export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
