import { tx } from '../i18n/tx';
import { isBlocked } from '../chatFilter';

/* The rules for a person's own name (POST /api/account/profile): spaces tidied, 2 to 80 characters, no contact details or links. */
export function cleanProfileName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return { ok: false, error: tx('Write a name of 2 to 80 characters.') };
  if (isBlocked(name)) return { ok: false, error: tx('Keep emails, phone numbers and links out of your name.') };
  return { ok: true, name };
}
