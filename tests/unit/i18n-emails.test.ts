import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { englishTx, TEMPLATES, type NotificationKind, type Tx } from '@/emails/templates';
import { txLookup, type Dict } from '@/lib/i18n/tx';
import { renderNotification } from '@/lib/cms/emailRender';
import { liveLangOr } from '@/lib/i18n/recipient';
import { forgetLanguages } from '@/lib/i18n/settingsRead';

/*
 * Notification emails in the reader's language (i18n phase 2, batch 4): every template in every bundled language fills all of its
 * {placeholders}, keeps the payload's names and amounts as they were sent, and is really translated; a language that is not published
 * falls back to English; English stays exactly as before.
 */
const LANGS = ['bn', 'ar', 'hi', 'es', 'fr', 'de', 'pt'];
const dicts = new Map<string, Dict>();
const txOf = (lang: string): Tx => {
  if (!dicts.has(lang)) dicts.set(lang, JSON.parse(readFileSync(`lib/i18n/strings/${lang}.json`, 'utf8')) as Dict);
  const d = dicts.get(lang);
  return (e, v) => txLookup(d, e, v);
};
const full = {
  title: 'Shop kit',
  amount: '$20',
  status: 'paid',
  note: 'N1',
  credits: 3,
  until: '2027-01-01',
  reason: 'R1',
  url: 'https://x.test',
  days: 4,
  date: '2027-02-02',
  outcome: 'cancelled',
  github: 'octo',
  version: '1.2',
  changelog: 'fixes',
  decision: 'approved',
  price: 50,
  hours: 5,
  request: 'Logo',
  method: 'PayPal',
  now: 'acct-1',
  was: 'acct-0',
  name: 'Kit',
  domain: 'x.test',
  what: 'W1',
  detail: 'D1',
  plan: 'Pro',
  billing: 'monthly',
  total: '$9',
  listed: 1,
  quoted: 2,
  due: 'tomorrow',
  result: 'ok',
  day: '2026-11-12',
  visitors: 9,
  repeat: 2,
  pages: 30,
  orders: 1,
  top: 'Kit',
  ok: true,
};
const kinds = Object.keys(TEMPLATES) as NotificationKind[];

describe('notification emails in other languages', () => {
  it('every template in every language fills every placeholder', () => {
    for (const lang of LANGS)
      for (const k of kinds)
        for (const p of [full, {}, { ok: false, decision: 'released' }]) {
          const m = TEMPLATES[k](p, txOf(lang));
          expect(`${m.subject}\n${m.text}`, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
        }
  });
  it('is translated, and the names and amounts from the payload stay as sent', () => {
    for (const lang of LANGS) {
      const en = TEMPLATES.order_funded(full);
      const m = TEMPLATES.order_funded(full, txOf(lang));
      expect(m.subject, lang).not.toBe(en.subject);
      expect(m.subject, lang).toContain('Shop kit');
      expect(TEMPLATES.payout_details_changed(full, txOf(lang)).text, lang).toContain('acct-1');
    }
    expect(TEMPLATES.order_funded(full, txOf('bn')).subject).toBe('Shop kit-এর পেমেন্ট পাওয়া গেছে');
  });
  it('English is the default and the CMS render keeps it', async () => {
    expect(TEMPLATES.order_funded({ title: 'Shop kit' })).toEqual(TEMPLATES.order_funded({ title: 'Shop kit' }, englishTx));
    expect(TEMPLATES.order_funded({ title: 'Shop kit' }).subject).toBe('Payment received for Shop kit');
    expect((await renderNotification('order_funded', { title: 'Shop kit' }))?.subject).toBe('Payment received for Shop kit');
  });
  it('a language that is not published goes out in English', async () => {
    forgetLanguages();
    expect(await liveLangOr('bn')).toBe('en'); // every language starts as a draft
    expect(await liveLangOr('xx')).toBe('en');
    expect(await liveLangOr(undefined)).toBe('en');
    expect((await renderNotification('order_funded', { title: 'Shop kit' }, await liveLangOr('bn')))?.subject).toBe('Payment received for Shop kit');
  });
  it('API errors: a known message is translated, an unknown one stays as it is, English is untouched', async () => {
    const { getI18n } = await import('@/lib/i18n/server');
    const bn = await getI18n('bn');
    expect(bn.translate('Sign in first.')).toBe('আগে সাইন ইন করুন।');
    expect(bn.translate('Order 12 is late by 3 hours')).toBe('Order 12 is late by 3 hours');
    expect((await getI18n('en')).translate('Sign in first.')).toBe('Sign in first.');
    const { jsonT } = await import('@/lib/i18n/jsonT');
    expect(await (await jsonT({ error: 'Sign in first.', code: 'auth' }, { status: 401 })).json()).toEqual({ error: 'Sign in first.', code: 'auth' }); // outside a request: English
  });
  it('public pages carry only the public words; dashboards add theirs', async () => {
    const { getI18n } = await import('@/lib/i18n/server');
    const { clientStrings } = await import('@/lib/i18n/catalog');
    const bn = await getI18n('bn');
    const pub = clientStrings('public');
    const dash = clientStrings('dash');
    expect(pub.length + dash.length).toBe(clientStrings().length);
    expect(pub.length).toBeLessThan(dash.length); // most client words are admin and dashboard words
    expect(Object.keys(bn.clientDict).every((k) => pub.includes(k))).toBe(true);
    expect(Object.keys(bn.dashDict).every((k) => dash.includes(k))).toBe(true);
    expect(Object.keys(bn.dashDict).length).toBeGreaterThan(0);
    const en = await getI18n('en');
    expect([Object.keys(en.clientDict).length, Object.keys(en.dashDict).length]).toEqual([0, 0]); // an English page sends nothing
  });
  it('a published language is used', async () => {
    expect((await renderNotification('order_funded', { title: 'Shop kit' }, 'bn'))?.subject).toBe('Shop kit-এর পেমেন্ট পাওয়া গেছে');
  });
});
