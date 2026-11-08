import { BRAND_DOMAIN } from '../brand';
import { EMAIL_ROUTES, type EmailPurpose } from '../emailRouting';

/*
 * The contact addresses an admin may change (owner, 2026-11-08: Admin › Settings › Contact & social). Pure, tested. Every address must be on our own
 * domain, so a changed setting can never send buyers' mail elsewhere. Anything not saved falls back to EMAIL_ROUTES.
 */
export type ContactRoutes = Record<EmailPurpose, string>;
export const CONTACT_KEYS = Object.keys(EMAIL_ROUTES) as EmailPurpose[];
const OWN = new RegExp(`^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@${BRAND_DOMAIN.replace(/\./g, '\\.')}$`);

export function checkContact(raw: unknown): { ok: true; value: Partial<ContactRoutes> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Send the addresses.' };
  const value: Partial<ContactRoutes> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(CONTACT_KEYS as string[]).includes(k)) return { ok: false, error: `Unknown address: ${k}.` };
    const a = String(v ?? '')
      .trim()
      .toLowerCase();
    if (!OWN.test(a)) return { ok: false, error: `The ${k} address must end with @${BRAND_DOMAIN}.` };
    if (a !== EMAIL_ROUTES[k as EmailPurpose]) value[k as EmailPurpose] = a;
  }
  return { ok: true, value };
}

/* Saved addresses over the defaults; anything malformed in storage is ignored. */
export function mergeContact(saved: unknown): ContactRoutes {
  const out = { ...EMAIL_ROUTES } as ContactRoutes;
  if (saved && typeof saved === 'object' && !Array.isArray(saved))
    for (const k of CONTACT_KEYS) {
      const v = (saved as Record<string, unknown>)[k];
      if (typeof v === 'string' && OWN.test(v)) out[k] = v;
    }
  return out;
}
