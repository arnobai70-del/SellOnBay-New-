import { describe, expect, it } from 'vitest';
import { CONFIG, DAY_MS, HOUR_MS } from '@/lib/config';
import { DEMO, STATES, TRANSITIONS, IllegalTransition, canTransition, dueSteps, orderFee, transition, type Order, type OrderState } from '@/lib/orders/machine';

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const mk = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  kind: 'product',
  pkg: 'asis',
  deliveryType: 'live_site',
  state: 'awaiting_payment',
  title: 't',
  buyerId: 'b',
  sellerId: 's',
  productId: null,
  productKey: 'p',
  devKey: null,
  lines: [['Site', 10_000]],
  priceCents: 10_000,
  feeCents: 1500,
  refundedCents: 0,
  currency: 'USD',
  days: 2,
  express: false,
  instant: false,
  demo: true,
  attempts: 0,
  createdAt: T0,
  ...over,
});
const go = (o: Order, to: OrderState, now = T0) => transition(o, to, { now }).order;

describe('order state machine: every move', () => {
  it('allows exactly the moves in the table and refuses all others', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        const allowed = TRANSITIONS[from].includes(to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(allowed);
        if (!allowed) expect(() => transition(mk({ state: from }), to, { now: T0 }), `${from} -> ${to}`).toThrow(IllegalTransition);
        else expect(() => transition(mk({ state: from }), to, { now: T0 })).not.toThrow();
      }
    }
  });
  it('terminal states lead nowhere', () => {
    for (const s of ['paid_out', 'refunded', 'cancelled'] as const) expect(TRANSITIONS[s]).toEqual([]);
  });
  it('the happy path from payment to payout', () => {
    let o = mk();
    for (const to of ['funded', 'in_delivery', 'delivered', 'accepted', 'payout_pending', 'paid_out'] as const) o = go(o, to);
    expect(o.state).toBe('paid_out');
  });
  it('a fix after a dispute goes back to delivered with a fresh review window', () => {
    let o = go(go(go(mk(), 'funded'), 'delivered'), 'disputed');
    o = go(o, 'fix_requested', T0 + HOUR_MS);
    o = go(o, 'delivered', T0 + 5 * HOUR_MS);
    expect(o.reviewEndsAt).toBe(T0 + 5 * HOUR_MS + CONFIG.review.hours * HOUR_MS);
  });
});

describe('what each move sets', () => {
  it('funded starts the delivery timer from the order days, or 24 hours for express', () => {
    expect(go(mk({ days: 2 }), 'funded').dueAt).toBe(T0 + 2 * DAY_MS);
    expect(go(mk({ express: true }), 'funded').dueAt).toBe(T0 + CONFIG.delivery.expressHours * HOUR_MS);
    expect(go(mk(), 'funded').fundedAt).toBe(T0);
  });
  it('delivered opens the 48 hour review window', () => {
    const o = go(go(mk(), 'funded'), 'delivered', T0 + HOUR_MS);
    expect(o.deliveredAt).toBe(T0 + HOUR_MS);
    expect(o.reviewEndsAt).toBe(T0 + HOUR_MS + 48 * HOUR_MS);
  });
  it('accepted sets the 7 day payout hold and the 7 day bug-fix window', () => {
    const o = go(go(go(mk(), 'funded'), 'delivered'), 'accepted', T0 + DAY_MS);
    expect(o.acceptedAt).toBe(T0 + DAY_MS);
    expect(o.payoutAfter).toBe(T0 + DAY_MS + 7 * DAY_MS);
    expect(o.bugfixUntil).toBe(T0 + DAY_MS + 7 * DAY_MS);
  });
  it('every move returns an event with who, when, from and to', () => {
    const r = transition(mk({ state: 'funded' }), 'in_delivery', { now: T0, actorId: 'seller-1', event: 'started', meta: { a: 1 } });
    expect(r.event).toEqual({ orderId: 'o1', actorId: 'seller-1', event: 'started', from: 'funded', to: 'in_delivery', meta: { a: 1 }, at: T0 });
    expect(transition(mk({ state: 'funded' }), 'in_delivery', { now: T0 }).event.event).toBe('to_in_delivery');
  });
  it('the moves do not change the order they were given', () => {
    const o = mk();
    go(o, 'funded');
    expect(o.state).toBe('awaiting_payment');
  });
});

describe('time jobs with a fake clock', () => {
  const real = (over: Partial<Order> = {}) => mk({ demo: false, ...over });
  it('auto-accepts when the review window ends, dated at the end of the window', () => {
    const delivered = go(go(real(), 'funded'), 'delivered', T0 + HOUR_MS);
    expect(dueSteps(delivered, delivered.reviewEndsAt! - 1)).toEqual([]);
    const steps = dueSteps(delivered, delivered.reviewEndsAt! + 3 * DAY_MS);
    expect(steps[0].event).toMatchObject({ event: 'auto_accepted', from: 'delivered', to: 'accepted', actorId: null, at: delivered.reviewEndsAt });
    expect(steps[0].order.acceptedAt).toBe(delivered.reviewEndsAt);
  });
  it('after the hold, an accepted order becomes payout_pending (and not a moment before)', () => {
    const accepted = go(go(go(real(), 'funded'), 'delivered'), 'accepted', T0);
    expect(dueSteps(accepted, accepted.payoutAfter! - 1)).toEqual([]);
    expect(dueSteps(accepted, accepted.payoutAfter!)[0].order.state).toBe('payout_pending');
  });
  it('a late order becomes overdue at its deadline; delivered orders never do', () => {
    const funded = go(real({ days: 1 }), 'funded');
    expect(dueSteps(funded, funded.dueAt! - 1)).toEqual([]);
    const s = dueSteps(funded, funded.dueAt! + HOUR_MS);
    expect(s.at(-1)?.order.state).toBe('overdue');
    expect(dueSteps(go(funded, 'delivered'), funded.dueAt! + 10 * DAY_MS).every((x) => x.order.state !== 'overdue')).toBe(true);
  });
  it('an overdue order can still be delivered or cancelled by the buyer, not accepted', () => {
    const od = go(go(real(), 'funded'), 'overdue');
    expect(canTransition(od.state, 'cancelled')).toBe(true);
    expect(canTransition(od.state, 'delivered')).toBe(true);
    expect(canTransition(od.state, 'accepted')).toBe(false);
  });
  it('a long-idle order catches up step by step, each dated when it became due', () => {
    const delivered = go(go(real(), 'funded'), 'delivered', T0);
    const steps = dueSteps(delivered, T0 + 30 * DAY_MS);
    expect(steps.map((s) => s.event.to)).toEqual(['accepted', 'payout_pending']);
    expect(steps[1].event.at).toBe(steps[0].order.payoutAfter);
  });
  it('disputed orders are held: no auto-accept and no payout step', () => {
    const d = go(go(go(real(), 'funded'), 'delivered'), 'disputed');
    expect(dueSteps(d, T0 + 90 * DAY_MS)).toEqual([]);
  });
  it('demo seller delivers after the demo delay; instant downloads at once; real sellers are never replaced', () => {
    const f = go(mk({ sellerId: null }), 'funded');
    expect(dueSteps(f, T0 + DEMO.startMs - 1)).toEqual([]);
    expect(dueSteps(f, T0 + DEMO.startMs).map((s) => s.event.to)).toEqual(['in_delivery']);
    expect(dueSteps(f, T0 + DEMO.startMs + DEMO.buildMs).map((s) => s.event.to)).toEqual(['in_delivery', 'delivered']);
    expect(dueSteps(go(mk({ instant: true, sellerId: null }), 'funded'), T0).map((s) => s.event.to)).toEqual(['delivered']);
    expect(dueSteps(go(mk({ sellerId: 'real-seller' }), 'funded'), T0 + HOUR_MS)).toEqual([]);
  });
});

describe('fee on an order', () => {
  it('22% on a product sale (30% under $20), a flat 20% on custom and trial work, on the first line only', () => {
    const lines: Order['lines'] = [
      ['Site', 10_000],
      ['Domain', 1_500],
    ];
    expect(orderFee(lines, 'product')).toBe(2200);
    expect(orderFee(lines, 'custom')).toBe(2000);
    expect(orderFee(lines, 'trial')).toBe(2000);
  });
});
