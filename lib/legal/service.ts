import 'server-only';
import { audit, auditStrict } from '../admin/audit';
import { LICENCE_TEXT_VERSION } from '../licenceTiers';
import { createAdminClient } from '../supabase/server';
import { checkDraft, LIMITS, licenceVersionLabel, nextDraft, type DocKey, type LegalDoc } from './rules';

/*
 * Versioned legal documents (migration 0063, legal_documents). Postgres when the table is there, memory otherwise.
 * Routes check the scope: Content (or Super) writes drafts; Super alone records a lawyer review and publishes.
 */
type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const g = globalThis as { __legalMem?: Map<string, LegalDoc>; __legalPg?: boolean; __legalCache?: Map<string, { at: number; doc: LegalDoc | null }> };
const mem = (g.__legalMem ??= new Map());
const cache = (g.__legalCache ??= new Map());

async function pg(): Promise<boolean> {
  if (g.__legalPg !== undefined) return g.__legalPg;
  try {
    const { error } = await createAdminClient().from('legal_documents').select('id').limit(1);
    g.__legalPg = !error;
  } catch {
    g.__legalPg = false;
  }
  return g.__legalPg;
}
const uuidOrNull = (id: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
const fromRow = (r: Record<string, unknown>): LegalDoc => ({
  id: r.id as string,
  docKey: r.doc_key as DocKey,
  version: r.version as number,
  title: r.title as string,
  body: r.body as string,
  summary: (r.summary as string) ?? '',
  status: r.status as LegalDoc['status'],
  lawyerReviewed: !!r.lawyer_reviewed,
  reviewedNote: (r.reviewed_note as string) ?? '',
  createdBy: (r.created_by as string | null) ?? null,
  publishedBy: (r.published_by as string | null) ?? null,
  publishedAt: r.published_at ? Date.parse(r.published_at as string) : null,
  createdAt: Date.parse(r.created_at as string),
  updatedAt: Date.parse(r.updated_at as string),
});

export async function legalDocs(key?: DocKey): Promise<LegalDoc[]> {
  let rows: LegalDoc[];
  if (!(await pg())) rows = [...mem.values()];
  else {
    let q = createAdminClient().from('legal_documents').select('*').order('version', { ascending: false }).limit(500);
    if (key) q = q.eq('doc_key', key);
    rows = ((await q).data ?? []).map(fromRow);
  }
  return rows.filter((d) => !key || d.docKey === key).sort((a, b) => a.docKey.localeCompare(b.docKey) || b.version - a.version);
}
export async function legalDoc(id: string): Promise<LegalDoc | null> {
  if (!(await pg())) return mem.get(id) ?? null;
  const { data } = await createAdminClient().from('legal_documents').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

/* The published version of a document, kept for a minute per server copy; a publish on this copy clears it at once. */
export async function publishedLegal(key: DocKey, now = Date.now()): Promise<LegalDoc | null> {
  const hit = cache.get(key);
  if (hit && now - hit.at < 60_000) return hit.doc;
  let doc: LegalDoc | null = null;
  try {
    doc = (await legalDocs(key)).find((d) => d.status === 'published') ?? null;
  } catch {
    doc = null; // a database problem shows the built-in text, never an empty page
  }
  cache.set(key, { at: now, doc });
  return doc;
}

/* What quotations snapshot as the licence text version. */
export async function currentLicenceVersion(): Promise<string> {
  return licenceVersionLabel(await publishedLegal('licences'), LICENCE_TEXT_VERSION);
}

async function put(d: LegalDoc, insert: boolean): Promise<boolean> {
  if (!(await pg())) {
    mem.set(d.id, d);
    return true;
  }
  const row = {
    id: d.id,
    doc_key: d.docKey,
    version: d.version,
    title: d.title,
    body: d.body,
    summary: d.summary,
    status: d.status,
    lawyer_reviewed: d.lawyerReviewed,
    reviewed_note: d.reviewedNote,
    created_by: uuidOrNull(d.createdBy),
    published_by: uuidOrNull(d.publishedBy),
    published_at: d.publishedAt ? new Date(d.publishedAt).toISOString() : null,
    updated_at: new Date(d.updatedAt).toISOString(),
  };
  const db = createAdminClient().from('legal_documents');
  const { error } = insert ? await db.insert({ ...row, created_at: new Date(d.createdAt).toISOString() }) : await db.update(row).eq('id', d.id);
  return !error;
}

export async function saveDraft(adminId: string | null, input: { id?: string; docKey: DocKey; title: string; body: string; summary?: string }): Promise<Result<LegalDoc>> {
  const c = checkDraft(input);
  if (!c.ok) return fail(400, c.error);
  const now = Date.now();
  if (input.id) {
    const d = await legalDoc(input.id);
    if (!d || d.docKey !== input.docKey) return fail(404, 'Draft not found.');
    if (d.status !== 'draft') return fail(409, 'A published version cannot change. Start a new draft.');
    const next = { ...d, title: c.title, body: c.body, summary: c.summary, lawyerReviewed: false, reviewedNote: '', updatedAt: now }; // an edit needs a new review
    if (!(await put(next, false))) return fail(500, 'Could not save the draft.');
    await audit(adminId, 'legal_draft_saved', 'legal_document', d.id, { docKey: d.docKey, version: d.version });
    return { ok: true, value: next };
  }
  const n = nextDraft(await legalDocs(input.docKey), input.docKey);
  if (!n.ok) return fail(409, n.error);
  const d: LegalDoc = {
    id: crypto.randomUUID(),
    docKey: input.docKey,
    version: n.version,
    title: c.title,
    body: c.body,
    summary: c.summary,
    status: 'draft',
    lawyerReviewed: false,
    reviewedNote: '',
    createdBy: adminId,
    publishedBy: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!(await put(d, true))) return fail(500, 'Could not save the draft.');
  await audit(adminId, 'legal_draft_created', 'legal_document', d.id, { docKey: d.docKey, version: d.version });
  return { ok: true, value: d };
}

/* Super Admin records the lawyer's review of a draft (who and when, in the note). Editing the draft afterwards clears it. */
export async function recordReview(superId: string | null, id: string, note: string): Promise<Result<LegalDoc>> {
  const n = note.replace(/\s+/g, ' ').trim();
  if (n.length < LIMITS.reviewedNote[0] || n.length > LIMITS.reviewedNote[1]) return fail(400, 'Say who reviewed it and when (5 to 500 characters).');
  const d = await legalDoc(id);
  if (!d) return fail(404, 'Draft not found.');
  if (d.status !== 'draft') return fail(409, 'Only a draft can be marked reviewed.');
  await auditStrict(superId, 'legal_review_recorded', 'legal_document', id, { docKey: d.docKey, version: d.version, note: n });
  const next = { ...d, lawyerReviewed: true, reviewedNote: n, updatedAt: Date.now() };
  if (!(await put(next, false))) return fail(500, 'Could not save.');
  return { ok: true, value: next };
}

/* Super Admin publishes a draft: the current published version is retired first, then the draft becomes the published one. */
export async function publishLegal(superId: string | null, id: string, reason: string): Promise<Result<LegalDoc>> {
  const why = reason.replace(/\s+/g, ' ').trim();
  if (why.length < 5) return fail(400, 'Give a reason for publishing.');
  const d = await legalDoc(id);
  if (!d) return fail(404, 'Draft not found.');
  if (d.status !== 'draft') return fail(409, 'This version is already published or retired.');
  await auditStrict(superId, 'legal_published', 'legal_document', id, { docKey: d.docKey, version: d.version, lawyerReviewed: d.lawyerReviewed, reason: why });
  const now = Date.now();
  const next: LegalDoc = { ...d, status: 'published', publishedBy: superId, publishedAt: now, updatedAt: now };
  if (await pg()) {
    const { error } = await createAdminClient().rpc('legal_publish', { p_id: id, p_by: uuidOrNull(superId) });
    if (error) return fail(500, 'Could not publish.');
  } else {
    for (const x of mem.values()) if (x.docKey === d.docKey && x.status === 'published') mem.set(x.id, { ...x, status: 'retired', updatedAt: now });
    mem.set(id, next);
  }
  cache.delete(d.docKey);
  return { ok: true, value: next };
}

export async function deleteDraft(adminId: string | null, id: string): Promise<Result<null>> {
  const d = await legalDoc(id);
  if (!d) return fail(404, 'Draft not found.');
  if (d.status !== 'draft') return fail(409, 'A published version is never deleted.');
  if (await pg()) {
    const { error } = await createAdminClient().from('legal_documents').delete().eq('id', id).eq('status', 'draft');
    if (error) return fail(500, 'Could not delete.');
  } else mem.delete(id);
  await audit(adminId, 'legal_draft_deleted', 'legal_document', id, { docKey: d.docKey, version: d.version });
  return { ok: true, value: null };
}
