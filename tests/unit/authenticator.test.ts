import { describe, expect, it } from 'vitest';
import { authenticatorRequired, passedCode } from '@/lib/auth/authenticator';

describe('the authenticator code (2FA)', () => {
  it('is always required: the AUTHENTICATOR_OFF switch was retired (owner, 2026-11-07)', () => {
    expect(authenticatorRequired({})).toBe(true);
    for (const v of ['', '0', '1', 'true', 'yes', 'on']) expect(authenticatorRequired({ AUTHENTICATOR_OFF: v })).toBe(true);
  });
  it('is passed only by a session at aal2, whatever the environment says', () => {
    expect(passedCode({ currentLevel: 'aal2' })).toBe(true);
    expect(passedCode({ currentLevel: 'aal1' })).toBe(false);
    expect(passedCode(null)).toBe(false);
    expect(passedCode({ currentLevel: 'aal1' }, { AUTHENTICATOR_OFF: '1' })).toBe(false);
    expect(passedCode(null, { AUTHENTICATOR_OFF: '1' })).toBe(false);
  });
});
