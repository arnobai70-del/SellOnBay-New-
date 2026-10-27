import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/*
 * Advertising tokens (Blueprint 9.2): never shown and never stored in plain text. A token is sealed with AES-256-GCM under a key that lives only
 * in the server environment (AD_TOKEN_KEY, 32 bytes as base64 or hex); the database would keep only the sealed value and a short reference.
 * No token exists yet: nothing can connect an ad account before blocker B-9 clears (lib/ads/adapter.ts). Pure apart from the random IV.
 */
export class TokenKeyError extends Error {}

export function tokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = (env.AD_TOKEN_KEY ?? '').trim();
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new TokenKeyError('AD_TOKEN_KEY must be 32 bytes (64 hex characters or base64).');
  return key;
}

/* "v1.<iv>.<tag>.<data>" in base64url; the account reference is bound in as associated data, so a sealed token cannot be moved to another account. */
export function sealToken(token: string, accountRef: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(accountRef));
  const data = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function openToken(sealed: string, accountRef: string, key: Buffer): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new TokenKeyError('Not a sealed token.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(accountRef));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

/* What may be shown or logged about a token: a short fingerprint, never the token. */
export const tokenFingerprint = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 10);
