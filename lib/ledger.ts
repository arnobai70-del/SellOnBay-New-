import { baseCents, type Line } from './orders/machine';

/*
 * Double-entry ledger. Pure: this file only builds entry sets and checks them; lib/ledgerStore.ts keeps them.
 * Every entry set has lines that debit and credit and add up to zero. Whole cents, never floats. Amounts are always positive; the side says the direction.
 *
 *   buyer pays        debit platform_cash            credit order_escrow
 *   order accepted    debit order_escrow             credit seller_pending (price - fee), credit platform_revenue (fee and extras)
 *   hold ended        debit seller_pending           credit seller_available
 *   payout batch      debit seller_available         credit payout_out
 *   refund            debit order_escrow             credit platform_cash
 *   reserve           at the end of the hold a share of the seller's money goes to seller_reserve instead of seller_available, and comes back later
 *   claw-back         money owed back (a refund after payout, a dispute fee) comes out of pending, then reserve, then available; what is left becomes
 *                     seller_debt (the seller owes it) and is taken from the seller's next earnings
 *   extra work funded same as "buyer pays", linked to the change request
 */
export type Side = 'debit' | 'credit';
export type LedgerLine = { account: string; amountCents: number; side: Side };
export type EntrySet = { key: string; orderId: string | null; memo: string; lines: LedgerLine[] };

export const acct = {
  cash: 'platform_cash',
  revenue: 'platform_revenue',
  escrow: (orderId: string) => `order_escrow:${orderId}`,
  pending: (sellerId: string) => `seller_pending:${sellerId}`,
  available: (sellerId: string) => `seller_available:${sellerId}`,
  reserve: (sellerId: string) => `seller_reserve:${sellerId}`,
  debt: (sellerId: string) => `seller_debt:${sellerId}`,
  payoutOut: (sellerId: string) => `payout_out:${sellerId}`,
};
/* Sellers of made-up starter listings have no account; their money sits under one shared name. */
export const sellerKey = (sellerId: string | null) => sellerId ?? 'demo-seller';

export class LedgerError extends Error {}

export const debit = (account: string, amountCents: number): LedgerLine => ({ account, amountCents, side: 'debit' });
export const credit = (account: string, amountCents: number): LedgerLine => ({ account, amountCents, side: 'credit' });

/* A set must have at least two lines, positive whole-cent amounts, and equal debits and credits. */
export function checkEntry(e: EntrySet): void {
  if (e.lines.length < 2) throw new LedgerError('An entry needs at least two lines.');
  let d = 0,
    c = 0;
  for (const l of e.lines) {
    if (!Number.isInteger(l.amountCents) || l.amountCents <= 0) throw new LedgerError(`Bad amount on ${l.account}: ${l.amountCents}`);
    if (l.side === 'debit') d += l.amountCents;
    else c += l.amountCents;
  }
  if (d !== c) throw new LedgerError(`Entry ${e.key} does not balance: debits ${d}, credits ${c}.`);
}

/* The order's money split: what the seller earns, what the platform keeps. The two always add up to the total paid. */
export function split(lines: Line[], feeCents: number): { total: number; sellerNet: number; platform: number } {
  const total = lines.reduce((s, l) => s + l[1], 0);
  const first = baseCents(lines);
  if (feeCents < 0 || feeCents > first) throw new LedgerError('The fee cannot be negative or more than the price.');
  return { total, sellerNet: first - feeCents, platform: total - first + feeCents };
}

type OrderMoney = { id: string; sellerId: string | null; lines: Line[]; feeCents: number };
const sum = (...lines: LedgerLine[]) => lines.filter((l) => l.amountCents > 0);

export const buyerPays = (o: OrderMoney): EntrySet => {
  const { total } = split(o.lines, o.feeCents);
  return { key: `pay:${o.id}`, orderId: o.id, memo: 'Buyer paid into escrow', lines: [debit(acct.cash, total), credit(acct.escrow(o.id), total)] };
};

export const extraWorkFunded = (o: { id: string }, changeRequestId: string, amountCents: number): EntrySet => ({
  key: `extra:${changeRequestId}`,
  orderId: o.id,
  memo: `Extra work ${changeRequestId} funded into escrow`,
  lines: [debit(acct.cash, amountCents), credit(acct.escrow(o.id), amountCents)],
});

/* Extra work that was funded is released at the same acceptance, with the custom-work fee taken from the seller's side. */
export const extraAccepted = (o: { id: string; sellerId: string | null }, changeRequestId: string, amountCents: number, feeCents: number): EntrySet => {
  if (feeCents < 0 || feeCents > amountCents) throw new LedgerError('The fee cannot be negative or more than the price.');
  return {
    key: `extra-accept:${changeRequestId}`,
    orderId: o.id,
    memo: `Extra work ${changeRequestId} accepted`,
    lines: sum(debit(acct.escrow(o.id), amountCents), credit(acct.pending(sellerKey(o.sellerId)), amountCents - feeCents), credit(acct.revenue, feeCents)),
  };
};

/* What the seller holds right now (seller_pending, seller_reserve, seller_available), for the claw-back below. */
export type SellerHolds = { pending: number; reserve: number; available: number };

/*
 * Debit lines that take `amountCents` back from a seller: first from pending (money not yet released), then reserve, then available, and whatever those
 * cannot cover becomes seller_debt, which the seller owes and which is netted off the next earnings (debtSettled). Never takes more than the seller has
 * in an account, so no account goes below zero. Lines with 0 are left out.
 */
export function takeFromSeller(sellerId: string, amountCents: number, have: SellerHolds): LedgerLine[] {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new LedgerError('Bad amount to take from a seller.');
  let left = amountCents;
  const out: LedgerLine[] = [];
  for (const [account, held] of [
    [acct.pending(sellerKey(sellerId)), have.pending],
    [acct.reserve(sellerKey(sellerId)), have.reserve],
    [acct.available(sellerKey(sellerId)), have.available],
  ] as const) {
    const take = Math.min(left, Math.max(0, held));
    if (take > 0) out.push(debit(account, take));
    left -= take;
  }
  if (left > 0) out.push(debit(acct.debt(sellerKey(sellerId)), left));
  return out;
}

/* A fee the seller is responsible for (a dispute fee): taken from the seller as above, paid to the platform's cash. */
export const sellerFee = (o: { id: string; sellerId: string | null }, key: string, memo: string, feeCents: number, have: SellerHolds): EntrySet => ({
  key,
  orderId: o.id,
  memo,
  lines: [...takeFromSeller(sellerKey(o.sellerId), feeCents, have), credit(acct.cash, feeCents)],
});

/* New earnings pay off what the seller owes first: pending goes down, the debt goes down by the same amount. */
export const debtSettled = (o: { id: string; sellerId: string | null }, amountCents: number): EntrySet => ({
  key: `debt-settle:${o.id}`,
  orderId: o.id,
  memo: 'Earnings used to pay off what the seller owes',
  lines: [debit(acct.pending(sellerKey(o.sellerId)), amountCents), credit(acct.debt(sellerKey(o.sellerId)), amountCents)],
});

/* How much of an amount a reserve rule keeps back: whole cents, rounded down, never more than the amount. */
export const reserveShare = (amountCents: number, percent: number) => Math.min(amountCents, Math.max(0, Math.floor((amountCents * Math.min(100, Math.max(0, percent))) / 100)));

export const orderAccepted = (o: OrderMoney): EntrySet => {
  const { total, sellerNet, platform } = split(o.lines, o.feeCents);
  return {
    key: `accept:${o.id}`,
    orderId: o.id,
    memo: 'Order accepted: escrow released to the seller (pending) and the platform',
    lines: sum(debit(acct.escrow(o.id), total), credit(acct.pending(sellerKey(o.sellerId)), sellerNet), credit(acct.revenue, platform)),
  };
};

/*
 * After a dispute. The money already moved on acceptance (to the seller's pending balance and the platform), so a refund reverses it.
 * A partial refund comes out of the seller's share (never more than the seller's net). A full refund of an accepted order gives back
 * everything: the order, any funded extra work, and the platform's fee.
 */
export const partialRefundAfterAccept = (o: OrderMoney, amountCents: number, have?: SellerHolds): EntrySet => {
  const { sellerNet } = split(o.lines, o.feeCents);
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > sellerNet) throw new LedgerError('A partial refund must be more than zero and no more than the seller earns on the order.');
  return {
    key: `refund:${o.id}:partial`,
    orderId: o.id,
    memo: 'Partial refund decided in a dispute, taken from the seller share',
    lines: [...(have ? takeFromSeller(sellerKey(o.sellerId), amountCents, have) : [debit(acct.pending(sellerKey(o.sellerId)), amountCents)]), credit(acct.cash, amountCents)],
  };
};
/* `refundedCents` is a partial refund already given back on this order: a full refund after it only gives back the rest. */
export const fullRefundAfterAccept = (o: OrderMoney, extras: { priceCents: number; feeCents: number }[], have?: SellerHolds, refundedCents = 0): EntrySet => {
  const { total, sellerNet, platform } = split(o.lines, o.feeCents);
  const extraTotal = extras.reduce((s, c) => s + c.priceCents, 0);
  const extraFees = extras.reduce((s, c) => s + c.feeCents, 0);
  if (!Number.isInteger(refundedCents) || refundedCents < 0 || refundedCents > sellerNet) throw new LedgerError('The earlier refund cannot be more than the seller earns on the order.');
  return {
    key: `refund-accepted:${o.id}`,
    orderId: o.id,
    memo: 'Full refund decided in a dispute: the release is reversed',
    lines: sum(
      ...(have
        ? takeFromSeller(sellerKey(o.sellerId), sellerNet + extraTotal - extraFees - refundedCents, have)
        : [debit(acct.pending(sellerKey(o.sellerId)), sellerNet + extraTotal - extraFees - refundedCents)]),
      debit(acct.revenue, platform + extraFees),
      credit(acct.cash, total + extraTotal - refundedCents),
    ),
  };
};

/*
 * The payout hold ended: the seller's pending money becomes available. Two things can change that, both worked out by the caller from the ledger:
 * what is really still pending (a claw-back may have taken some of it already) and the reserve to keep back (a share goes to seller_reserve for a while).
 * Returns null when nothing is left to move.
 */
export const holdMoved = (o: OrderMoney, extraNetCents = 0, opts: { pendingCents?: number; reserveCents?: number } = {}): EntrySet | null => {
  const planned = split(o.lines, o.feeCents).sellerNet + extraNetCents;
  const amount = Math.min(planned, opts.pendingCents ?? planned);
  if (amount <= 0) return null;
  const reserve = Math.min(amount, opts.reserveCents ?? 0);
  return {
    key: `hold:${o.id}`,
    orderId: o.id,
    memo: reserve > 0 ? 'Payout hold ended: earnings are available, part is kept in reserve' : 'Payout hold ended: earnings are available',
    lines: sum(debit(acct.pending(sellerKey(o.sellerId)), amount), credit(acct.available(sellerKey(o.sellerId)), amount - reserve), credit(acct.reserve(sellerKey(o.sellerId)), reserve)),
  };
};

/* The plain case: the whole of the seller's net moves from pending to available. */
export const holdEnded = (o: OrderMoney, extraNetCents = 0): EntrySet => holdMoved(o, extraNetCents)!;

/* The reserve of an order is let go: it becomes available (or less, if a claw-back already took some of it). */
export const reserveReleased = (o: { id: string; sellerId: string | null }, amountCents: number): EntrySet => ({
  key: `reserve-release:${o.id}`,
  orderId: o.id,
  memo: 'Reserve released: earnings are available',
  lines: [debit(acct.reserve(sellerKey(o.sellerId)), amountCents), credit(acct.available(sellerKey(o.sellerId)), amountCents)],
});

export const refund = (o: { id: string }, amountCents: number, tag = 'full'): EntrySet => ({
  key: `refund:${o.id}:${tag}`,
  orderId: o.id,
  memo: 'Refund out of escrow',
  lines: [debit(acct.escrow(o.id), amountCents), credit(acct.cash, amountCents)],
});

export const payoutBatch = (sellerId: string, amountCents: number, batchKey: string): EntrySet => ({
  key: `payout:${batchKey}:${sellerId}`,
  orderId: null,
  memo: 'Weekly payout',
  lines: [debit(acct.available(sellerId), amountCents), credit(acct.payoutOut(sellerId), amountCents)],
});

/* ---------- balances and the rules that must always hold ---------- */

/* Accounts that hold money owed to someone grow on the credit side; platform_cash is the one that grows on the debit side. */
export const creditNormal = (account: string) => account !== acct.cash && !account.startsWith('seller_debt:');

export type Balances = Map<string, number>;
export function balancesOf(entries: EntrySet[]): Balances {
  const b: Balances = new Map();
  for (const e of entries)
    for (const l of e.lines) {
      const sign = l.side === 'credit' ? 1 : -1; // credits minus debits
      b.set(l.account, (b.get(l.account) ?? 0) + sign * l.amountCents);
    }
  return b;
}
/* What the account holds in its normal direction (cash is shown as debits minus credits). */
export const holds = (b: Balances, account: string) => (creditNormal(account) ? 1 : -1) * (b.get(account) ?? 0) || 0; // `|| 0` turns -0 into 0

/* Accounts that must never go below zero. */
const mustStayPositive = (account: string) =>
  account.startsWith('order_escrow:') || account.startsWith('seller_pending:') || account.startsWith('seller_available:') || account.startsWith('seller_reserve:');

/* An in-memory ledger that refuses entries that would break a rule. The database function ledger_post enforces the same rules. */
export class Ledger {
  entries: EntrySet[] = [];
  private keys = new Set<string>();
  private bal: Balances = new Map();

  /* Posts an entry once. The same key a second time changes nothing and returns false. */
  post(e: EntrySet): boolean {
    checkEntry(e);
    if (this.keys.has(e.key)) return false;
    const next = new Map(this.bal);
    for (const l of e.lines) next.set(l.account, (next.get(l.account) ?? 0) + (l.side === 'credit' ? 1 : -1) * l.amountCents);
    for (const l of e.lines) if (mustStayPositive(l.account) && (next.get(l.account) ?? 0) < 0) throw new LedgerError(`${l.account} cannot go below zero.`);
    this.bal = next;
    this.keys.add(e.key);
    this.entries.push(e);
    return true;
  }
  balance(account: string) {
    return holds(this.bal, account);
  }
  /* Total of everything: debits and credits across the whole ledger must be equal. */
  isBalanced() {
    return [...this.bal.values()].reduce((s, v) => s + v, 0) === 0;
  }
}
