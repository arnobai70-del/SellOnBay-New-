import 'server-only';
import type { Tx } from '../../emails/templates';
import { englishTx } from '../../emails/templates';
import { isCode, liveLanguages, SOURCE } from './config';
import { getI18n } from './server';
import { languageSettings } from './settingsRead';

/*
 * The language a message goes out in (i18n phase 2): the one saved on the person's account (user metadata "lang", set by the language
 * switcher through /api/account/language) when that language is enabled and published right now; English otherwise. A language that was
 * unpublished after someone chose it falls back to English, the same as on the pages.
 */
export async function liveLangOr(lang: unknown): Promise<string> {
  if (!isCode(lang) || lang === SOURCE) return SOURCE;
  try {
    return liveLanguages(await languageSettings()).some((l) => l.code === lang) ? lang : SOURCE;
  } catch {
    return SOURCE; // the settings could not be read: never block a message over its language
  }
}

/* The translator for a language. English needs nothing loaded. */
export async function txFor(lang: string): Promise<Tx> {
  if (lang === SOURCE) return englishTx;
  try {
    return (await getI18n(lang)).tx;
  } catch {
    return englishTx;
  }
}
