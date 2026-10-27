import 'server-only';
import { TEMPLATES, type NotificationKind, type Payload } from '../../emails/templates';
import { fillTemplate } from './docs';
import { publishedEmail } from './docStore';

/*
 * The words of one notification: the email template a Super Admin published in Admin > CMS (lib/cms/docStore.ts), else the built-in one
 * (emails/templates.ts). A database problem always falls back to the built-in words, so a notification is never lost to the CMS.
 */
export async function renderNotification(kind: NotificationKind, payload: Payload): Promise<{ subject: string; text: string } | null> {
  const base = TEMPLATES[kind];
  if (!base) return null;
  try {
    const t = await publishedEmail(kind);
    if (t) return fillTemplate(t, payload as Record<string, unknown>);
  } catch {
    // built-in words below
  }
  return base(payload);
}
