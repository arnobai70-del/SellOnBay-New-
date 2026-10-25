import { describe, expect, it } from 'vitest';
import { feeCents } from '@/lib/config';
import { Ledger, LedgerError, acct, balancesOf, buyerPays, checkEntry, extraWorkFunded, holdEnded, orderAccepted, payoutBatch, refund, split } from '@/lib/ledger';
import type { Line } from '@/lib/orders/machine';

const order = (id: string, first = 10_000, extra = 0, sellerId: string | null = 's1', kind: 'sale' | 'custom' = 'sale') => {
  const lines: Line[] = extra
    ? [
        ['Site', first],
        ['Domain', extra],
      ]
    : [['Site', first]];
  return { id, sellerId, lines, feeCents: feeCents(first, kind) };
};

describe('ledger: entry sets', () => {
  it('every builder produces a balanced set (debits equal credits, whole positive cents)', () => {
    const o = order('o1', 9_999, 1_500);
    for (const e of [buyerPays(o), orderAccepted(o), holdEnded(o), refund(o, 500), extraWorkFunded(o, 'cr1', 700), payoutBatch('s1', 1234, '2026-w40')]) {
      expect(() => checkEntry(e)).not.toThrow();
      const net = [...balancesOf([e]).values()].reduce((s, v) => s + v, 0);
      expect(net).toBe(0);
    }
  });
  it('refuses unbalanced sets, floats, zero and negative amounts, and one-line sets', () => {
    const bad = (lines: { account: string; amountCents: number; side: 'debit' | 'credit' }[]) => () => checkEntry({ key: 'k', orderId: null, memo: '', lines });
    expect(
      bad([
        { account: 'a', amountCents: 100, side: 'debit' },
        { account: 'b', amountCents: 99, side: 'credit' },
      ]),
    ).toThrow(LedgerError);
    expect(
      bad([
        { account: 'a', amountCents: 10.5, side: 'debit' },
        { account: 'b', amountCents: 10.5, side: 'credit' },
      ]),
    ).toThrow(LedgerError);
    expect(
      bad([
        { account: 'a', amountCents: 0, side: 'debit' },
        { account: 'b', amountCents: 0, side: 'credit' },
      ]),
    ).toThrow(LedgerError);
    expect(
      bad([
        { account: 'a', amountCents: -5, side: 'debit' },
        { account: 'b', amountCents: -5, side: 'credit' },
      ]),
    ).toThrow(LedgerError);
    expect(bad([{ account: 'a', amountCents: 5, side: 'debit' }])).toThrow(LedgerError);
  });
  it('the split of an order adds up to what the buyer paid, whatever the rounding', () => {
    for (const first of [1, 3, 99, 333, 1999, 2901, 14_999])
      for (const extra of [0, 1, 1500]) {
        const o = order('x', first, extra);
        const s = split(o.lines, o.feeCents);
        expect(s.sellerNet + s.platform).toBe(s.total);
        expect(s.total).toBe(first + extra);
      }
    expect(() => split([['a', 100]], 101)).toThrow(LedgerError);
  });
});

describe('ledger: a full life of one order', () => {
  it('pays in, is accepted, the hold ends, a payout goes out: every balance is right at each step', () => {
    const L = new Ledger();
    const o = order('o1', 10_000, 1_500); // seller price 100.00, domain 15.00, fee 22% of 100.00
    L.post(buyerPays(o));
    expect(L.balance(acct.cash)).toBe(11_500);
    expect(L.balance(acct.escrow('o1'))).toBe(11_500);
    L.post(orderAccepted(o));
    expect(L.balance(acct.escrow('o1'))).toBe(0);
    expect(L.balance(acct.pending('s1'))).toBe(7_800);
    expect(L.balance(acct.revenue)).toBe(2_200 + 1_500);
    L.post(holdEnded(o));
    expect(L.balance(acct.pending('s1'))).toBe(0);
    expect(L.balance(acct.available('s1'))).toBe(7_800);
    L.post(payoutBatch('s1', 7_800, 'w1'));
    expect(L.balance(acct.available('s1'))).toBe(0);
    expect(L.balance(acct.payoutOut('s1'))).toBe(7_800);
    expect(L.isBalanced()).toBe(true);
  });
  it('a refund returns the money from escrow to cash; a second refund of the same kind changes nothing', () => {
    const L = new Ledger();
    const o = order('o2');
    L.post(buyerPays(o));
    expect(L.post(refund(o, 10_000))).toBe(true);
    expect(L.post(refund(o, 10_000))).toBe(false);
    expect(L.balance(acct.escrow('o2'))).toBe(0);
    expect(L.balance(acct.cash)).toBe(0);
  });
  it('a partial refund keeps the rest in escrow', () => {
    const L = new Ledger();
    const o = order('o3');
    L.post(buyerPays(o));
    L.post(refund(o, 4_000, 'part1'));
    expect(L.balance(acct.escrow('o3'))).toBe(6_000);
  });
  it('extra work is funded into the same escrow, linked to its request', () => {
    const L = new Ledger();
    const o = order('o4');
    L.post(buyerPays(o));
    L.post(extraWorkFunded(o, 'cr1', 2_500));
    expect(L.balance(acct.escrow('o4'))).toBe(12_500);
    expect(L.entries.at(-1)?.key).toBe('extra:cr1');
  });
});

describe('ledger: rules that must hold', () => {
  it('escrow for an order never goes negative', () => {
    const L = new Ledger();
    const o = order('o5');
    expect(() => L.post(orderAccepted(o))).toThrow(/below zero/); // nothing was paid in
    L.post(buyerPays(o));
    expect(() => L.post(refund(o, 10_001, 'too-much'))).toThrow(/below zero/);
    L.post(refund(o, 10_000, 'ok'));
    expect(() => L.post(orderAccepted(o))).toThrow(/below zero/); // refunded orders cannot also be released
  });
  it('a failed post leaves the ledger exactly as it was', () => {
    const L = new Ledger();
    const o = order('o6');
    L.post(buyerPays(o));
    const before = JSON.stringify([...balancesOf(L.entries)]);
    expect(() => L.post(refund(o, 99_999, 'x'))).toThrow();
    expect(JSON.stringify([...balancesOf(L.entries)])).toBe(before);
    expect(L.entries).toHaveLength(1);
  });
  it('a seller never has more available than accepted and aged orders, and never more than they hold', () => {
    const L = new Ledger();
    const o = order('o7');
    L.post(buyerPays(o));
    expect(() => L.post(holdEnded(o))).toThrow(/below zero/); // not accepted yet, nothing pending
    L.post(orderAccepted(o));
    expect(() => L.post(payoutBatch('s1', 1, 'early'))).toThrow(/below zero/); // still pending, not available
    L.post(holdEnded(o));
    expect(() => L.post(payoutBatch('s1', 7_801, 'greedy'))).toThrow(/below zero/);
    L.post(payoutBatch('s1', 7_800, 'fair'));
  });
  it('the same entry key twice changes nothing (idempotent)', () => {
    const L = new Ledger();
    const o = order('o8');
    expect(L.post(buyerPays(o))).toBe(true);
    expect(L.post(buyerPays(o))).toBe(false);
    expect(L.balance(acct.cash)).toBe(10_000);
    expect(L.entries).toHaveLength(1);
  });
  it('random sequences of orders keep the books balanced and every protected account at zero or more', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const L = new Ledger();
    const orders = Array.from({ length: 60 }, (_, i) =>
      order(`r${i}`, 100 + Math.floor(rnd() * 20_000), rnd() < 0.4 ? Math.floor(rnd() * 3000) + 1 : 0, rnd() < 0.2 ? null : `s${i % 5}`, rnd() < 0.3 ? 'custom' : 'sale'),
    );
    for (const o of orders) {
      const steps = [() => buyerPays(o), () => orderAccepted(o), () => holdEnded(o), () => refund(o, 1 + Math.floor(rnd() * 5000), 'p' + Math.floor(rnd() * 3))];
      for (let n = 0; n < 8; n++) {
        try {
          L.post(steps[Math.floor(rnd() * steps.length)]());
        } catch (e) {
          expect(e).toBeInstanceOf(LedgerError);
        }
        expect(L.isBalanced()).toBe(true);
        for (const [account] of balancesOf(L.entries)) if (/^(order_escrow|seller_pending|seller_available):/.test(account)) expect(L.balance(account)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(L.entries.length).toBeGreaterThan(30);
  });
});
