import { tx } from '../i18n/tx';
/*
 * Versioned legal documents (SellOnBay 2.0, placeholder P05). Pure, tested.
 * Content admins write drafts; only a Super Admin publishes. A published version never changes (the database refuses it too); publishing the
 * next version retires the current one. Until a version is published the built-in page text shows. [LAWYER REVIEW] applies to every text:
 * a version is marked reviewed only when a Super Admin records who reviewed it (blocker B-11).
 */
export const LEGAL_DOCS = {
  terms: { title: 'Terms of service', path: '/terms' },
  privacy: { title: 'Privacy policy', path: '/privacy' },
  refunds: { title: 'Refund policy', path: '/refunds' },
  acceptable_use: { title: 'Acceptable use policy', path: '/acceptable-use' },
  seller_agreement: { title: 'Seller agreement', path: '/seller-agreement' },
  dmca: { title: 'Copyright (DMCA) policy', path: '/dmca' },
  licences: { title: 'Licence terms', path: null },
} as const satisfies Record<string, { title: string; path: string | null }>;
export type DocKey = keyof typeof LEGAL_DOCS;
export const isDocKey = (k: unknown): k is DocKey => typeof k === 'string' && Object.hasOwn(LEGAL_DOCS, k);
export const docForPath = (path: string): DocKey | null => (Object.keys(LEGAL_DOCS) as DocKey[]).find((k) => LEGAL_DOCS[k].path === path) ?? null;

export type LegalStatus = 'draft' | 'published' | 'retired';
export type LegalDoc = {
  id: string;
  docKey: DocKey;
  version: number;
  title: string;
  body: string;
  summary: string;
  status: LegalStatus;
  lawyerReviewed: boolean;
  reviewedNote: string;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export const LIMITS = { title: [3, 160], body: [20, 200_000], summary: 500, reviewedNote: [5, 500] } as const;

export function checkDraft(i: { title: string; body: string; summary?: string }): { ok: true; title: string; body: string; summary: string } | { ok: false; error: string } {
  const title = i.title.replace(/\s+/g, ' ').trim();
  const body = i.body.replace(/\r\n?/g, '\n').trim();
  const summary = (i.summary ?? '').replace(/\s+/g, ' ').trim();
  if (title.length < LIMITS.title[0] || title.length > LIMITS.title[1]) return { ok: false, error: `The title is ${LIMITS.title[0]} to ${LIMITS.title[1]} characters.` };
  if (body.length < LIMITS.body[0] || body.length > LIMITS.body[1]) return { ok: false, error: tx('Write the full text (at least 20 characters).') };
  if (summary.length > LIMITS.summary) return { ok: false, error: `Keep the summary of changes under ${LIMITS.summary} characters.` };
  if (/<\s*(script|iframe|object|embed|style)\b/i.test(body)) return { ok: false, error: tx('Legal texts are Markdown; HTML is not allowed.') };
  return { ok: true, title, body, summary };
}

/* The next version number, and whether a new draft may be started (one open draft per document). */
export function nextDraft(existing: LegalDoc[], key: DocKey): { ok: true; version: number } | { ok: false; error: string } {
  const mine = existing.filter((d) => d.docKey === key);
  if (mine.some((d) => d.status === 'draft')) return { ok: false, error: tx('This document already has a draft. Edit that one.') };
  return { ok: true, version: mine.reduce((m, d) => Math.max(m, d.version), 0) + 1 };
}

/* The version label stored on quotations and orders for the licence text: the published licence document, or the built-in draft label. */
export const licenceVersionLabel = (published: LegalDoc | null, builtIn: string) => (published && published.docKey === 'licences' ? `licences-v${published.version}` : builtIn);
