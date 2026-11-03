/* The words and the tone of each state: mint money held, blue in progress, violet done, pink a problem, gold waiting on someone (app/globals.css). */
const LABEL: Record<string, [string, string]> = {
  draft: ['Draft', 'chip st-plain'],
  awaiting_payment: ['Waiting for payment', 'chip st-gold'],
  payment_review: ['Payment being checked', 'chip st-gold'],
  release_pending: ['Paid, waiting for release', 'chip st-mint'],
  funded: ['Paid, starting', 'chip st-mint'],
  in_delivery: ['Seller working', 'chip st-blue'],
  delivered: ['Ready to review', 'chip st-blue'],
  accepted: ['Accepted', 'chip st-violet'],
  payout_pending: ['Accepted', 'chip st-violet'],
  paid_out: ['Done', 'chip st-violet'],
  disputed: ['Problem reported', 'chip st-pink'],
  fix_requested: ['Fix requested', 'chip st-gold'],
  overdue: ['Late', 'chip st-pink'],
  refunded: ['Refunded', 'chip st-plain'],
  cancelled: ['Cancelled', 'chip st-plain'],
};

/* The same words for an order's state everywhere it is listed. */
export function StateChip({ state }: { state: string }) {
  const [label, cls] = LABEL[state] ?? [state.replace(/_/g, ' '), 'chip st-plain'];
  return (
    <span className={cls}>
      <i />
      {label}
    </span>
  );
}
