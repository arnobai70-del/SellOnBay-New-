/*
 * The one switch for the authenticator code (2FA) that sellers and admins need. On unless AUTHENTICATOR_OFF=1 is set in the server environment,
 * so a missing or mistyped value keeps the code required. Read on every call, never NEXT_PUBLIC: the browser cannot change it.
 */
export function authenticatorRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.AUTHENTICATOR_OFF !== '1';
}

/* Has this session passed the code, or is the code switched off? Takes the result of getAuthenticatorAssuranceLevel(). */
export function passedCode(aal: { currentLevel?: string | null } | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return !authenticatorRequired(env) || aal?.currentLevel === 'aal2';
}
