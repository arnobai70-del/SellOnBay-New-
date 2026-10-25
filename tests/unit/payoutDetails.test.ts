import { describe, expect, it } from 'vitest';
import { checkPayoutDetails, payoutLabel } from '@/lib/payoutDetails';

describe('payout details', () => {
  it('accepts a bank account and an email for Payoneer or Wise', () => {
    expect(checkPayoutDetails('bank', '  DE89 3704 0044 0532 0130 00, Commerzbank, A. Rahman ')).toEqual({
      ok: true,
      method: 'bank',
      account: 'DE89 3704 0044 0532 0130 00, Commerzbank, A. Rahman',
    });
    expect(checkPayoutDetails('wise', 'seller@example.com').ok).toBe(true);
    expect(checkPayoutDetails('payoneer', 'seller@example.com').ok).toBe(true);
  });
  it('refuses unknown methods, short or odd values, and a non-email for Wise', () => {
    expect(checkPayoutDetails('venmo', 'seller@example.com').ok).toBe(false);
    expect(checkPayoutDetails('paypal', 'seller@example.com').ok).toBe(true);
    expect(checkPayoutDetails('paypal', 'DE89370400440532013000').ok).toBe(false);
    expect(checkPayoutDetails('bank', '12').ok).toBe(false);
    expect(checkPayoutDetails('bank', 'Commerzbank only').ok).toBe(false);
    expect(checkPayoutDetails('wise', 'DE89370400440532013000').ok).toBe(false);
    expect(checkPayoutDetails('bank', 'DE89 3704\u0000 0044').ok).toBe(false);
    expect(checkPayoutDetails('bank', 'x'.repeat(201) + '1234').ok).toBe(false);
  });
  it('shows only the last four characters', () => {
    expect(payoutLabel('wise', 'seller@example.com')).toBe('Wise, s•••@example.com');
    expect(payoutLabel('bank', 'DE89 3704 0044 0532 0130 00')).toBe('Bank transfer, ending 3000');
    expect(payoutLabel(null, 'x')).toBeNull();
  });
});
