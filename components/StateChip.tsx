const LABEL: Record<string, [string, string]> = {
  draft: ['Draft', 'chip'],
  awaiting_payment: ['Waiting for payment', 'chip amber'],
  funded: ['Paid, starting', 'chip blue'],
  in_delivery: ['Seller working', 'chip blue'],
  delivered: ['Ready to review', 'chip amber'],
  accepted: ['Accepted', 'chip mint'],
  payout_pending: ['Accepted', 'chip mint'],
  paid_out: ['Done', 'chip mint'],
  disputed: ['Problem reported', 'chip rose'],
  fix_requested: ['Fix requested', 'chip amber'],
  overdue: ['Late', 'chip rose'],
  refunded: ['Refunded', 'chip'],
  cancelled: ['Cancelled', 'chip'],
};

/* The same words for an order's state everywhere it is listed. */
export function StateChip({ state }: { state: string }) {
  const [label, cls] = LABEL[state] ?? [state.replace(/_/g, ' '), 'chip'];
  return (
    <span className={cls}>
      <i />
      {label}
    </span>
  );
}
