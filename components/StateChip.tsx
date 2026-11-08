/* The words and the tone of each state: mint money held, blue in progress, violet done, pink a problem, gold waiting on someone (app/globals.css). */
const LABEL: Record<string, [string, string]> = {
  draft: ['Draft', 'status st-draft'],
  awaiting_payment: ['Waiting for payment', 'chip st-gold'],
  payment_review: ['Payment being checked', 'chip st-gold'],
  release_pending: ['Paid, waiting for release', 'status st-ok'],
  funded: ['Paid, starting', 'status st-ok'],
  in_delivery: ['Seller working', 'chip st-blue'],
  delivered: ['Ready to review', 'chip st-blue'],
  accepted: ['Accepted', 'status st-info'],
  payout_pending: ['Accepted', 'status st-info'],
  paid_out: ['Done', 'status st-info'],
  disputed: ['Problem reported', 'status st-bad'],
  fix_requested: ['Fix requested', 'chip st-gold'],
  overdue: ['Late', 'status st-bad'],
  refunded: ['Refunded', 'status st-draft'],
  cancelled: ['Cancelled', 'status st-draft'],
};

/* The same words for an order's state everywhere it is listed. */
export function StateChip({ state }: { state: string }) {
  const [label, cls] = LABEL[state] ?? [state.replace(/_/g, ' '), 'status st-draft'];
  return (
    <span className={cls}>
      <i />
      {label}
    </span>
  );
}
