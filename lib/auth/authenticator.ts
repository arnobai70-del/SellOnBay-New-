/*
 * The authenticator code (2FA) that sellers and admins need. Always on: the temporary AUTHENTICATOR_OFF switch was retired by the owner on 2026-11-07,
 * and the environment can no longer turn the code off. The env argument stays so older callers and tests keep compiling; it is ignored.
 */
export function authenticatorRequired(_env: Record<string, string | undefined> = process.env): boolean {
  return true;
}

/* Has this session passed the code? Takes the result of getAuthenticatorAssuranceLevel(). */
export function passedCode(aal: { currentLevel?: string | null } | null | undefined, _env: Record<string, string | undefined> = process.env): boolean {
  return aal?.currentLevel === 'aal2';
}
