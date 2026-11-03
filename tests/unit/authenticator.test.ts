import { describe, expect, it } from 'vitest';
import { authenticatorRequired, passedCode } from '@/lib/auth/authenticator';

describe('authenticator switch', () => {
  it('stays on unless the value is exactly 1', () => {
    expect(authenticatorRequired({})).toBe(true);
    for (const v of ['', '0', 'true', 'yes', 'on']) expect(authenticatorRequired({ AUTHENTICATOR_OFF: v })).toBe(true);
    expect(authenticatorRequired({ AUTHENTICATOR_OFF: '1' })).toBe(false);
  });

  it('with the switch on, only an aal2 session passes', () => {
    expect(passedCode({ currentLevel: 'aal2' }, {})).toBe(true);
    expect(passedCode({ currentLevel: 'aal1' }, {})).toBe(false);
    expect(passedCode({ currentLevel: null }, {})).toBe(false);
    expect(passedCode(null, {})).toBe(false);
  });

  it('with the switch off, any session passes', () => {
    expect(passedCode({ currentLevel: 'aal1' }, { AUTHENTICATOR_OFF: '1' })).toBe(true);
    expect(passedCode(null, { AUTHENTICATOR_OFF: '1' })).toBe(true);
  });
});
