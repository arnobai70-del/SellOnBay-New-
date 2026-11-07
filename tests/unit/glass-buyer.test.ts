import { describe, expect, it } from 'vitest';
import { buyerStatus, hasFiles, orderTab, usd } from '@/lib/glass/orderStatus';
import { STATES } from '@/lib/orders/machine';

describe('how an order reads to its buyer', () => {
  it('names every state the order machine has', () => {
    for (const s of STATES) expect(buyerStatus(s).label, s).not.toContain('_');
  });
  it('puts each state in one tab', () => {
    expect(orderTab('beta_approved')).toBe('done');
    expect(orderTab('accepted')).toBe('done');
    expect(orderTab('refunded')).toBe('refunded');
    expect(orderTab('beta_declined')).toBe('refunded');
    expect(orderTab('beta_requested')).toBe('progress');
    expect(orderTab('payment_review')).toBe('progress');
  });
  it('offers files only where the server will give them', () => {
    expect(hasFiles('beta_approved')).toBe(true);
    expect(hasFiles('beta_requested')).toBe(false);
    expect(hasFiles('awaiting_payment')).toBe(false);
    expect(hasFiles('refunded')).toBe(false);
    expect(usd(4900)).toBe('$49.00');
  });
});
