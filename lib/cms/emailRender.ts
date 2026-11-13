import 'server-only';
import { TEMPLATES, type NotificationKind, type Payload } from '../../emails/templates';
import { SOURCE } from '../i18n/config';
import { txFor } from '../i18n/recipient';
import { fillTemplate } from './docs';
import { publishedEmail } from './docStore';

/*
 * The words of one notification in the reader's language: the email template a Super Admin published in Admin > CMS for that language
 * (lib/cms/docStore.ts: "email:<kind>" for English, "email:<kind>@<lang>" for the others), else the built-in one (emails/templates.ts)
 * translated into that language. Each language stands on its own: an English template never replaces another language's words. A database
 * problem always falls back to the built-in words, so a notification is never lost to the CMS.
 */
export async function renderNotification(kind: NotificationKind, payload: Payload, lang: string = SOURCE): Promise<{ subject: string; text: string } | null> {
  const base = TEMPLATES[kind];
  if (!base) return null;
  try {
    const t = await publishedEmail(kind, lang);
    if (t) return fillTemplate(t, payload as Record<string, unknown>);
  } catch {
    // built-in words below
  }
  return base(payload, await txFor(lang));
}
