import { describe, expect, it } from 'vitest';
import { derivedSecret } from '@/lib/secrets';
import { resendConfigured } from '@/lib/providers/email/resend';

describe('fewer variables to set', () => {
  it('uses the variable when it is set, else a key made from APP_SECRET or the Supabase key', () => {
    expect(derivedSecret('GUARD_SALT', { GUARD_SALT: 'mine' })).toBe('mine');
    const a = derivedSecret('GUARD_SALT', { SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60) })!;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(derivedSecret('GUARD_SALT', { SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60) })).toBe(a); // stable
    expect(derivedSecret('ANALYTICS_SALT', { SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60) })).not.toBe(a); // one key per purpose
    expect(derivedSecret('GUARD_SALT', { APP_SECRET: 'y'.repeat(40), SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(60) })).not.toBe(a);
    expect(derivedSecret('GUARD_SALT', { APP_SECRET: 'short' })).toBeNull();
    expect(derivedSecret('GUARD_SALT', {})).toBeNull();
  });
  it('real email needs only the Resend key; fake or another provider keeps it off', () => {
    const key = 're_' + 'a'.repeat(20);
    expect(resendConfigured({ RESEND_API_KEY: key })).toBe(true);
    expect(resendConfigured({ RESEND_API_KEY: key, EMAIL_PROVIDER: 'resend' })).toBe(true);
    expect(resendConfigured({ RESEND_API_KEY: key, EMAIL_PROVIDER: 'fake' })).toBe(false);
    expect(resendConfigured({})).toBe(false);
    expect(resendConfigured({ RESEND_API_KEY: 'nope' })).toBe(false);
  });
});
