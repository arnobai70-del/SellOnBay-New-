import { tx } from '../i18n/tx';
import type { AdminScope } from '../admin/scopes';
import { checkPageDoc, pageByKey, type PageDoc } from '../content/registry';

/*
 * CMS documents with draft, preview, approval and publish (SellOnBay 2.0 Phase 12). Pure, tested.
 *   faq            the FAQ page groups (question and answer)
 *   how_it_works   the three steps for buyers and the three for sellers (each step has its own picture)
 *   email:<kind>   the subject and text of one notification email, with {{placeholders}} filled from the notification
 * A Content admin saves a draft; publishing needs a second person (four eyes): the admin who publishes may not be the one who last edited
 * the draft, unless they are a Super Admin. Email templates are published by a Super Admin only. Nothing saved = the built-in text shows.
 * Text is plain (no HTML); answers and email text may hold simple links written as https addresses.
 */
export type FaqDoc = { groups: { title: string; items: { q: string; a: string }[] }[] };
export type Step = { t: string; d: string };
export type HowDoc = { buy: Step[]; sell: Step[] };
export type EmailDoc = { subject: string; text: string };
export type DocName = 'faq' | 'how_it_works' | `email:${string}` | `page:${string}`;

export const isEmailDoc = (n: string): n is `email:${string}` => /^email:[a-z_]{3,40}$/.test(n);
/* One public page's words (owner, 2026-11-08; lib/content/registry.ts), by the page's key. */
export const isPageDoc = (n: string): n is `page:${string}` => /^page:[a-z-]{2,40}$/.test(n) && !!pageByKey(n.slice(5)) && !pageByKey(n.slice(5))!.legal;
export const isDocName = (n: string): n is DocName => n === 'faq' || n === 'how_it_works' || isEmailDoc(n) || isPageDoc(n);

/* Who may draft and who may publish each document. */
export function docScopes(name: DocName): { edit: AdminScope; publish: AdminScope } {
  return isEmailDoc(name) ? { edit: 'content', publish: 'super' } : { edit: 'content', publish: 'content' };
}

const line = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max + 1);
const block = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max + 1);
const NO_HTML = /<\s*\/?\s*[a-z][^>]*>/i;

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function checkFaq(raw: unknown): Check<FaqDoc> {
  const groups = (raw as { groups?: unknown })?.groups;
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 8) return { ok: false, error: tx('Give 1 to 8 groups of questions.') };
  const out: FaqDoc['groups'] = [];
  for (const g of groups) {
    const title = line((g as { title?: unknown })?.title, 60);
    const items = (g as { items?: unknown })?.items;
    if (title.length < 3 || title.length > 60) return { ok: false, error: tx('Each group needs a title of 3 to 60 characters.') };
    if (!Array.isArray(items) || items.length < 1 || items.length > 15) return { ok: false, error: `Group "${title}" needs 1 to 15 questions.` };
    const qs: { q: string; a: string }[] = [];
    for (const it of items) {
      const q = line((it as { q?: unknown })?.q, 200);
      const a = block((it as { a?: unknown })?.a, 1200);
      if (q.length < 5 || q.length > 200 || a.length < 10 || a.length > 1200) return { ok: false, error: tx('Each question is 5 to 200 characters and each answer 10 to 1,200.') };
      if (NO_HTML.test(q) || NO_HTML.test(a)) return { ok: false, error: tx('Plain text only, no HTML.') };
      qs.push({ q, a });
    }
    out.push({ title, items: qs });
  }
  return { ok: true, value: { groups: out } };
}

export function checkHow(raw: unknown): Check<HowDoc> {
  const out: HowDoc = { buy: [], sell: [] };
  for (const side of ['buy', 'sell'] as const) {
    const steps = (raw as Record<string, unknown>)?.[side];
    if (!Array.isArray(steps) || steps.length !== 3) return { ok: false, error: `Give exactly 3 steps for ${side === 'buy' ? 'buyers' : 'sellers'}.` };
    for (const s of steps) {
      const t = line((s as Step)?.t, 60);
      const d = line((s as Step)?.d, 240);
      if (t.length < 3 || t.length > 60 || d.length < 10 || d.length > 240) return { ok: false, error: tx('Each step has a title of 3 to 60 characters and a line of 10 to 240.') };
      if (NO_HTML.test(t) || NO_HTML.test(d)) return { ok: false, error: tx('Plain text only, no HTML.') };
      out[side].push({ t, d });
    }
  }
  return { ok: true, value: out };
}

export const PLACEHOLDER = /\{\{\s*([a-z_]{1,30})\s*\}\}/g;
export function checkEmail(raw: unknown): Check<EmailDoc> {
  const subject = line((raw as EmailDoc)?.subject, 150);
  const text = block((raw as EmailDoc)?.text, 4000);
  if (subject.length < 3 || subject.length > 150) return { ok: false, error: tx('The subject is 3 to 150 characters.') };
  if (text.length < 10 || text.length > 4000) return { ok: false, error: tx('The text is 10 to 4,000 characters.') };
  if (NO_HTML.test(subject) || NO_HTML.test(text)) return { ok: false, error: tx('Plain text only, no HTML.') };
  if (/\{\{(?!\s*[a-z_]{1,30}\s*\}\})/.test(subject + text)) return { ok: false, error: tx('Placeholders look like {{title}}: lower-case letters and _ only.') };
  return { ok: true, value: { subject, text } };
}

export function checkDoc(name: DocName, raw: unknown): Check<FaqDoc | HowDoc | EmailDoc | PageDoc> {
  if (isPageDoc(name)) return checkPageDoc(pageByKey(name.slice(5))!, raw);
  return name === 'faq' ? checkFaq(raw) : name === 'how_it_works' ? checkHow(raw) : checkEmail(raw);
}

/* Fills {{key}} from a notification's payload. Unknown keys become empty; values are plain text (emails are plain text). */
export function fillTemplate(t: EmailDoc, payload: Record<string, unknown>): EmailDoc {
  const val = (k: string) => {
    const v = payload[k];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  };
  return { subject: t.subject.replace(PLACEHOLDER, (_, k) => val(k)).replace(/[\r\n]+/g, ' '), text: t.text.replace(PLACEHOLDER, (_, k) => val(k)) };
}

/* Four eyes: the publisher must not be the last editor of the draft, unless a Super Admin publishes. */
export function publishProblem(i: { name: DocName; draftEditedBy: string | null; publisher: string | null; publisherScopes: readonly AdminScope[] }): string | null {
  const need = docScopes(i.name).publish;
  const isSuper = i.publisherScopes.includes('super');
  if (need === 'super' && !isSuper) return 'Only a Super Admin can publish email templates.';
  if (!isSuper && !i.publisherScopes.includes(need)) return 'Your admin account cannot publish this.';
  if (!isSuper && i.draftEditedBy && i.draftEditedBy === i.publisher) return 'Another admin must check and publish your draft (or a Super Admin).';
  return null;
}

/*
 * The editor's plain-text forms (so admins never write JSON).
 * FAQ:           "# Group title" starts a group; "Q: ..." a question; "A: ..." its answer, which may run over several lines.
 * How it works:  a "Buyers" and a "Sellers" section, each with three lines "Title | what happens".
 */
export function faqToText(d: FaqDoc): string {
  return d.groups.map((g) => [`# ${g.title}`, ...g.items.flatMap((i) => [`Q: ${i.q}`, `A: ${i.a}`])].join('\n')).join('\n\n');
}
export function parseFaqText(text: string): { groups: { title: string; items: { q: string; a: string }[] }[] } {
  const groups: { title: string; items: { q: string; a: string }[] }[] = [];
  let cur: { q: string; a: string } | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const l = raw.trimEnd();
    if (/^#\s+/.test(l)) {
      groups.push({ title: l.replace(/^#\s+/, ''), items: [] });
      cur = null;
    } else if (/^Q:\s*/i.test(l)) {
      if (!groups.length) groups.push({ title: 'Questions', items: [] });
      cur = { q: l.replace(/^Q:\s*/i, ''), a: '' };
      groups[groups.length - 1].items.push(cur);
    } else if (/^A:\s*/i.test(l) && cur) cur.a = l.replace(/^A:\s*/i, '');
    else if (cur && cur.a && l.trim()) cur.a += '\n' + l.trim();
  }
  return { groups };
}
export function howToText(d: HowDoc): string {
  return ['Buyers', ...d.buy.map((s) => `${s.t} | ${s.d}`), '', 'Sellers', ...d.sell.map((s) => `${s.t} | ${s.d}`)].join('\n');
}
export function parseHowText(text: string): { buy: Step[]; sell: Step[] } {
  const out: { buy: Step[]; sell: Step[] } = { buy: [], sell: [] };
  let side: 'buy' | 'sell' | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const l = raw.trim();
    if (/^buyers?:?$/i.test(l)) side = 'buy';
    else if (/^sellers?:?$/i.test(l)) side = 'sell';
    else if (side && l.includes('|')) {
      const [t, ...rest] = l.split('|');
      out[side].push({ t: t.trim(), d: rest.join('|').trim() });
    }
  }
  return out;
}
