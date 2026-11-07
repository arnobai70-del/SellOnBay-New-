import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkPayoutDetails, payoutMethodsFor } from '@/lib/payoutDetails';

const src = (p: string) => readFileSync(p, 'utf8');

describe('payout methods (owner, 2026-11-07)', () => {
  it('offers PayPal, Payoneer, Wise and bank everywhere, and bKash only in Bangladesh', () => {
    expect(payoutMethodsFor('US').map(([m]) => m)).toEqual(['bank', 'payoneer', 'wise', 'paypal']);
    expect(payoutMethodsFor(null).map(([m]) => m)).not.toContain('bkash');
    expect(payoutMethodsFor('BD').map(([m]) => m)).toContain('bkash');
  });
  it('refuses bKash outside Bangladesh and checks the number', () => {
    expect(checkPayoutDetails('bkash', '01712345678', 'IN').ok).toBe(false);
    expect(checkPayoutDetails('bkash', '01712345678').ok).toBe(false);
    expect(checkPayoutDetails('bkash', '12345', 'BD').ok).toBe(false);
    expect(checkPayoutDetails('bkash', '017-1234-5678', 'BD')).toEqual({ ok: true, method: 'bkash', account: '01712345678' });
    expect(checkPayoutDetails('paypal', 'me@example.com', 'BD').ok).toBe(true);
  });
});

describe('seller APIs', () => {
  const routes = ['app/api/seller/listings/beta/route.ts', 'app/api/seller/store/route.ts', 'app/api/seller/verification/route.ts'];
  it('each one needs a seller past the authenticator code, and is audited', () => {
    for (const r of routes) {
      const s = src(r);
      expect(s, r).toMatch(/await sellerOnly\(\)/);
      expect(s, r).toMatch(/await audit\(/);
    }
    expect(src('lib/seller/guard.ts')).toMatch(/passedCode\(aal\)/);
  });
  it('a beta offer changes only the seller own listing', () => expect(src(routes[0])).toMatch(/\.eq\('seller_id', s\.id\)/));
  it('ID documents are checked by their bytes and kept in the private bucket, never returned', () => {
    const s = src(routes[2]);
    expect(s).toMatch(/proofKind\(bytes\)/);
    expect(s).toMatch(/from\('seller-ids'\)/);
    expect(s).not.toMatch(/createSignedUrl|getPublicUrl/);
    const m = src('supabase/migrations/0079_seller_mode.sql');
    expect(m).toMatch(/'seller-ids', 'seller-ids', false/);
    expect(m).toMatch(/revoke all on seller_verifications from anon, authenticated/);
    expect(m).toMatch(/grant select, insert, update on seller_verifications to service_role/);
  });
  it('the switch to selling never makes an admin a seller and is audited', () => {
    const s = src('app/api/account/sell/route.ts');
    expect(s).toMatch(/role === 'admin'/);
    expect(s).toMatch(/\.eq\('role', 'buyer'\)/);
    expect(s).toMatch(/selling_enabled/);
  });
  it('the AUTHENTICATOR_OFF switch is gone from the code', () => {
    expect(src('lib/auth/authenticator.ts')).not.toMatch(/process\.env\.AUTHENTICATOR_OFF|env\.AUTHENTICATOR_OFF/);
    expect(src('.env.example')).not.toMatch(/AUTHENTICATOR_OFF/);
  });
});
