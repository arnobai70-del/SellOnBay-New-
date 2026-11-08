import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit, auditStrict } from '../admin/audit';
import { hasScope, type AdminScope } from '../admin/scopes';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import { checkDoc, docScopes, publishProblem, type DocName, type EmailDoc, type FaqDoc, type HowDoc } from './docs';
import { recordRevision } from './history';

/*
 * CMS documents (lib/cms/docs.ts) kept in app_settings: the draft under "cms:draft:<name>", the published version under "cms:doc:<name>"
 * (no migration). Every publish is a numbered revision in Site history (content_revisions), so a published text can be rolled back.
 * Public pages read the published version with a short cache; a publish on this server copy refreshes them at once.
 */
export type Draft<T = unknown> = { data: T; editedBy: string | null; editedAt: number };
export type Published<T = unknown> = { data: T; version: number; publishedBy: string | null; publishedAt: number; editedBy: string | null };
type Result<T = null> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const g = globalThis as { __cmsDocMem?: Map<string, unknown>; __cmsDocCache?: Map<string, { at: number; v: unknown }> };
const mem = (g.__cmsDocMem ??= new Map());
const cache = (g.__cmsDocCache ??= new Map());
const DRAFT = (n: DocName) => `cms:draft:${n}`;
export const PUBLISHED = (n: DocName) => `cms:doc:${n}`;
/* Is app_settings there? Kept apart from lib/seo so that emails (lib/notify) can read templates without loading the SEO modules. */
let ready: { ok: boolean; at: number } | undefined;
async function settingsTableReady(): Promise<boolean> {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || Date.now() - ready.at > 60_000) ready = { ok: !(await createAdminClient().from('app_settings').select('key').limit(1)).error, at: Date.now() };
  return ready.ok;
}
const uuid = (id: string | null) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);

async function read<T>(key: string, fresh = false): Promise<T | null> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.v as T | null;
  let v: unknown = mem.get(key) ?? null;
  try {
    if (await settingsTableReady()) v = (await createAdminClient().from('app_settings').select('value').eq('key', key).maybeSingle()).data?.value ?? null;
    if (v && typeof v === 'object' && (v as { __empty?: boolean }).__empty === true) v = null; // a removed draft (see write)
  } catch {
    v = null; // a database problem shows the built-in text
  }
  cache.set(key, { at: Date.now(), v });
  return v as T | null;
}
async function write(key: string, value: unknown | null, by: string | null): Promise<boolean> {
  cache.delete(key);
  if (!(await settingsTableReady())) {
    if (value === null) mem.delete(key);
    else mem.set(key, value);
    return true;
  }
  const db = createAdminClient().from('app_settings');
  // A removed value is saved as an empty marker: the server may not delete app_settings rows (migration 0040), and read() treats it as nothing saved.
  const { error } = await db.upsert({ key, value: value === null ? { __empty: true } : value, changed_by: uuid(by), changed_at: new Date().toISOString() });
  return !error;
}
const refresh = (name: DocName) => {
  try {
    for (const p of name === 'faq' ? ['/faq', '/sell', '/how-it-works'] : name === 'how_it_works' ? ['/how-it-works', '/', '/sell'] : []) revalidatePath(p);
  } catch {
    // outside a request (tests)
  }
};

export const draftOf = <T>(name: DocName) => read<Draft<T>>(DRAFT(name), true);
export const publishedOf = <T>(name: DocName, fresh = false) => read<Published<T>>(PUBLISHED(name), fresh);

export async function saveDraft(adminId: string | null, scopes: readonly AdminScope[], name: DocName, raw: unknown): Promise<Result<Draft>> {
  if (!hasScope(scopes, docScopes(name).edit)) return fail(403, 'Your admin account cannot edit this.');
  const c = checkDoc(name, raw);
  if (!c.ok) return fail(400, c.error);
  const d: Draft = { data: c.value, editedBy: adminId, editedAt: Date.now() };
  if (!(await write(DRAFT(name), d, adminId))) return fail(500, 'Could not save the draft.');
  await audit(adminId, 'cms_draft_saved', 'cms', name, {});
  return { ok: true, value: d };
}

export async function discardDraft(adminId: string | null, scopes: readonly AdminScope[], name: DocName): Promise<Result> {
  if (!hasScope(scopes, docScopes(name).edit)) return fail(403, 'Your admin account cannot edit this.');
  if (!(await draftOf(name))) return fail(404, 'There is no draft.');
  await write(DRAFT(name), null, adminId);
  await audit(adminId, 'cms_draft_discarded', 'cms', name, {});
  return { ok: true, value: null };
}

/* Publishes the draft after the four-eyes check; the draft then goes away and the published text is a new revision in the history. */
export async function publishDraft(adminId: string | null, scopes: readonly AdminScope[], name: DocName): Promise<Result<Published>> {
  const d = await draftOf(name);
  if (!d) return fail(404, 'There is no draft to publish.');
  const problem = publishProblem({ name, draftEditedBy: d.editedBy, publisher: adminId, publisherScopes: scopes });
  if (problem) return fail(403, problem);
  const c = checkDoc(name, d.data);
  if (!c.ok) return fail(400, c.error);
  return publishValue(adminId, name, c.value, d.editedBy, 'cms_published');
}

/* Shared by publish and by a Site history rollback (lib/cms/restore.ts), which puts a previously published version back. */
export async function publishValue(adminId: string | null, name: DocName, value: unknown, editedBy: string | null, action = 'cms_rolled_back'): Promise<Result<Published>> {
  const c = checkDoc(name, value);
  if (!c.ok) return fail(400, c.error);
  const before = await publishedOf(name, true);
  await auditStrict(adminId, action, 'cms', name, { version: (before?.version ?? 0) + 1 });
  const p: Published = { data: c.value, version: (before?.version ?? 0) + 1, publishedBy: adminId, publishedAt: Date.now(), editedBy };
  if (!(await write(PUBLISHED(name), p, adminId))) return fail(500, 'Could not publish.');
  if (action === 'cms_published') await write(DRAFT(name), null, adminId);
  await recordRevision(adminId, PUBLISHED(name), c.value, before?.data ?? null);
  refresh(name);
  return { ok: true, value: p };
}

/* What public pages and emails read. */
export const publishedFaq = async () => (await publishedOf<FaqDoc>('faq'))?.data ?? null;
export const publishedHow = async () => (await publishedOf<HowDoc>('how_it_works'))?.data ?? null;
export const publishedEmail = async (kind: string) => (await publishedOf<EmailDoc>(`email:${kind}`))?.data ?? null;
