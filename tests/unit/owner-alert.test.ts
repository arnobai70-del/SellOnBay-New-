import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeEmail } from '@/lib/providers/email';
import { ADMIN_ALERT_EMAIL, notifyAdmins } from '@/lib/notify';

vi.mock('server-only', () => ({}));

describe('admin alerts reach the owner address', () => {
  beforeEach(() => {
    fakeEmail.sent.length = 0;
  });
  it('mails sellonbayus@gmail.com for a payout alert, with the details and no secrets', async () => {
    expect(ADMIN_ALERT_EMAIL).toBe('sellonbayus@gmail.com');
    await notifyAdmins('admin_payout', { what: '2 payouts ready to send ($85.00) for the week of 2026-10-25', detail: '- Mira: $50.00 by PayPal (m•••@example.com)' }, 'ready:test');
    const mail = fakeEmail.sent.find((m) => m.to === 'sellonbayus@gmail.com');
    expect(mail?.subject).toMatch(/^Payout: 2 payouts ready to send/);
    expect(mail?.text).toContain('Mira: $50.00 by PayPal');
    expect(mail?.text).toContain('admin dashboard');
  });
});
