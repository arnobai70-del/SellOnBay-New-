import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* The free beta on / off switch (owner, 2026-11-14): one clear control in Admin › Settings, Super Admin only, with a reason in the audit log;
   turning the beta off waits for a payment provider, because then buyers have to pay. */
describe('free beta switch', () => {
  const page = readFileSync('app/(dash)/admin/settings/page.tsx', 'utf8');
  const api = readFileSync('app/api/admin/settings/route.ts', 'utf8');
  it('the settings page shows it on or off with one button that flips the payments mode, with a reason', () => {
    expect(page).toMatch(/data-beta-switch/);
    expect(page).toMatch(/fixed=\{\{ paymentsMode: live \? 'beta_free' : 'live' \}\}/);
    expect(page).toMatch(/fields=\{\[why\(tx\)\]\}/);
    expect(page.match(/name: 'paymentsMode'/g) ?? []).toHaveLength(0); // the old dropdown is gone: one control only
  });
  it('the API is for the Super Admin and refuses to turn the beta off without a payment provider', () => {
    expect(api).toMatch(/adminOnly\('super'\)/);
    expect(api).toMatch(/patch\.paymentsMode === 'live' && !paypalConfigured\(\)[\s\S]{0,300}status: 409/);
  });
});
