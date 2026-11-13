import type { Tx } from '@/lib/i18n/tx';
import { getI18n } from '@/lib/i18n/server';
/* The words and the tone of each state: mint money held, blue in progress, violet done, pink a problem, gold waiting on someone (app/globals.css). */
const LABEL = (tx: Tx): Record<string, [string, string]> => ({
  draft: ['Draft', 'status st-draft'],
  awaiting_payment: [tx('Waiting for payment'), 'chip st-gold'],
  payment_review: [tx('Payment being checked'), 'chip st-gold'],
  release_pending: [tx('Paid, waiting for release'), 'status st-ok'],
  funded: [tx('Paid, starting'), 'status st-ok'],
  in_delivery: [tx('Seller working'), 'chip st-blue'],
  delivered: [tx('Ready to review'), 'chip st-blue'],
  accepted: ['Accepted', 'status st-info'],
  payout_pending: ['Accepted', 'status st-info'],
  paid_out: ['Done', 'status st-info'],
  disputed: [tx('Problem reported'), 'status st-bad'],
  fix_requested: [tx('Fix requested'), 'chip st-gold'],
  overdue: ['Late', 'status st-bad'],
  refunded: ['Refunded', 'status st-draft'],
  cancelled: ['Cancelled', 'status st-draft'],
});

/* The same words for an order's state everywhere it is listed. */
export async function StateChip({ state }: { state: string }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [label, cls] = LABEL(tx)[state] ?? [state.replace(/_/g, ' '), 'status st-draft'];
  return (
    <span className={cls}>
      <i />
      {label}
    </span>
  );
}
