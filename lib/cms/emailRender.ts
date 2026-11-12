import 'server-only';
import { TEMPLATES, type NotificationKind, type Payload } from '../../emails/templates';
import { SOURCE } from '../i18n/config';
import { txFor } from '../i18n/recipient';
import { fillTemplate } from './docs';
import { publishedEmail } from './docStore';

/*
 * The words of one notification: the email template a Super Admin published in Admin > CMS (lib/cms/docStore.ts), else the built-in one
 * (emails/templates.ts) in the reader's language. A published CMS template is written in English and wins for every reader, so an admin's
 * correction is never hidden behind an older translation. A database problem always falls back to the built-in words, so a notification is
 * never lost to the CMS.
 */
export async function renderNotification(kind: NotificationKind, payload: Payload, lang: string = SOURCE): Promise<{ subject: string; text: string } | null> {
  const base = TEMPLATES[kind];
  if (!base) return null;
  try {
    const t = await publishedEmail(kind);
    if (t) return fillTemplate(t, payload as Record<string, unknown>);
  } catch {
    // built-in words below
  }
  return base(payload, await txFor(lang));
}
