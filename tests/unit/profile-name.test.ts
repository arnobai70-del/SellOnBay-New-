import { describe, expect, it } from 'vitest';
import { cleanProfileName } from '@/lib/account/profileName';

describe('own name on the profile (lib/account/profileName.ts)', () => {
  it('keeps a normal name and tidies its spaces', () => {
    expect(cleanProfileName('  Arnab   Roy ')).toEqual({ ok: true, name: 'Arnab Roy' });
  });
  it('refuses names that are too short or too long', () => {
    expect(cleanProfileName(' a ').ok).toBe(false);
    expect(cleanProfileName('x'.repeat(81)).ok).toBe(false);
  });
  it('refuses contact details and links', () => {
    expect(cleanProfileName('Mail me at someone@example.com').ok).toBe(false);
    expect(cleanProfileName('Call +1 415 555 0100').ok).toBe(false);
    expect(cleanProfileName('Visit www.example.com').ok).toBe(false);
  });
});
