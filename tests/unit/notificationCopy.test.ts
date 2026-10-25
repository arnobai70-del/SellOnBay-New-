import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/emails/templates';
import { CONFIG } from '@/lib/config';

describe('notification delivery policy copy', () => {
  it('uses the current 1–7 day delivery range when the order has no days value', () => {
    const note = TEMPLATES.order_funded({ title: 'Website' });
    expect(note.text).toContain(`${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays} days`);
    expect(note.text).not.toContain('1 to 3 days');
  });
  it('displays the actual seller selected delivery days, including a numeric payload', () => {
    expect(TEMPLATES.order_funded({ title: 'Website', days: 4 }).text).toContain('4 days');
    expect(TEMPLATES.order_funded({ title: 'Website', days: '6' }).text).toContain('6 days');
  });
  it('uses a nonempty fallback when an invalid day count is passed', () => {
    const t = TEMPLATES.order_funded({ title: 'Website', days: Number.NaN });
    expect(t.text).toContain('days');
    expect(t.text).not.toContain('NaN');
  });
});
