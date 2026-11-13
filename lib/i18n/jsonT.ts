import 'server-only';
import { NextResponse } from 'next/server';
import { SOURCE } from './config';
import { getI18n } from './server';

/*
 * An API answer whose `error` reaches the person in their language (i18n phase 2, batch 4). The language is the one the proxy set for this
 * request (the saved choice, only when published); the message is translated when the catalogue has it (every error written as tx('…') in
 * app/api and lib), and stays English otherwise, for example a message with a number filled in. English requests are untouched. Error codes,
 * ids and amounts in the body are never translated. A problem reading the language never changes the answer.
 */
export async function jsonT<T extends Record<string, unknown>>(body: T, init?: ResponseInit): Promise<NextResponse<T>> {
  if (typeof body.error === 'string' && body.error) {
    try {
      const i18n = await getI18n();
      if (i18n.lang !== SOURCE) return NextResponse.json({ ...body, error: i18n.translate(body.error) }, init);
    } catch {
      // English below
    }
  }
  return NextResponse.json(body, init);
}
