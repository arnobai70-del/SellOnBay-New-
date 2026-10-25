import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { parseMarkdown, type Block } from '../markdown';
import { createAdminClient } from '../supabase/server';
import { SEO_PAGES, pageWordsProblem, seoPage, type PageWordsInput } from './pageList';
import { settingsTableReady } from './pageMeta';

/*
 * The heading, intro and (for policy pages) the whole text an admin rewrote for a public page at /dashboard/admin/seo/pages/edit,
 * kept in `app_settings` under "page:words:<path>". Empty means "use the built-in words" (lib/seo/pageList.ts).
 * The text is Markdown read by lib/markdown.ts, which never produces HTML, so saved words cannot inject markup.
 */
const KEY = (path: string) => `page:words:${path}`;
const EMPTY: PageWordsInput = { heading: '', intro: '', body: '' };
const mem: { saved: Record<string, PageWordsInput> } = ((globalThis as { __pageWordsMem?: { saved: Record<string, PageWordsInput> } }).__pageWordsMem ??= { saved: {} });
const g = globalThis as { __pageWordsCache?: { at: number; value: Record<string, PageWordsInput> } };

const clean = (path: string, v: unknown): PageWordsInput => {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<PageWordsInput>;
  const out = { heading: typeof o.heading === 'string' ? o.heading : '', intro: typeof o.intro === 'string' ? o.intro : '', body: typeof o.body === 'string' ? o.body : '' };
  return pageWordsProblem(out, seoPage(path)?.words) ? EMPTY : out; // a bad saved value never breaks a page
};

/* Every saved rewrite, by path, with a short cache. */
export async function allPageWords(now = Date.now()): Promise<Record<string, PageWordsInput>> {
  if (g.__pageWordsCache && now - g.__pageWordsCache.at < 30_000) return g.__pageWordsCache.value;
  let value: Record<string, PageWordsInput> = { ...mem.saved };
  if (await settingsTableReady().catch(() => false)) {
    const { data } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in(
        'key',
        SEO_PAGES.filter((p) => p.words).map((p) => KEY(p.path)),
      );
    value = Object.fromEntries((data ?? []).map((r) => [String(r.key).slice('page:words:'.length), clean(String(r.key).slice('page:words:'.length), r.value)]));
  }
  g.__pageWordsCache = { at: now, value };
  return value;
}

export type ShownWords = { heading: string; intro: string | undefined; body: Block[] | null };

/* What a page shows: the saved words, or its built-in ones. `body` is null unless an admin rewrote the page's text. */
export async function pageWords(path: string): Promise<ShownWords> {
  const spec = seoPage(path)?.words;
  if (!spec) throw new Error(`No words are listed for ${path} in lib/seo/pageList.ts`);
  const saved = (await allPageWords())[path] ?? EMPTY;
  return {
    heading: saved.heading.trim() || spec.heading,
    intro: saved.intro.trim() || spec.intro,
    body: spec.body && saved.body.trim() ? parseMarkdown(saved.body) : null,
  };
}

export async function setPageWords(adminId: string | null, path: string, v: PageWordsInput): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const spec = seoPage(path)?.words;
  if (!spec) return { ok: false, status: 404, error: 'That page has no words to change here.' };
  const next = { heading: v.heading.trim(), intro: v.intro.trim(), body: v.body.replace(/\r\n?/g, '\n').trim() };
  const bad = pageWordsProblem(next, spec);
  if (bad) return { ok: false, status: 400, error: bad };
  g.__pageWordsCache = undefined;
  const before = (await allPageWords())[path] ?? EMPTY;
  if (before.heading === next.heading && before.intro === next.intro && before.body === next.body) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (await settingsTableReady()) {
    const { error } = await createAdminClient()
      .from('app_settings')
      .upsert({ key: KEY(path), value: next, changed_by: /^[0-9a-f-]{36}$/i.test(adminId ?? '') ? adminId : null, changed_at: new Date().toISOString() });
    if (error) return { ok: false, status: 500, error: 'Could not save.' };
  } else mem.saved[path] = next;
  g.__pageWordsCache = undefined;
  // Both versions go in the audit log in full, so an earlier text can always be copied back.
  await audit(adminId, 'page_words_changed', 'settings', path, { from: before, to: next });
  try {
    revalidatePath(path);
  } catch {
    // outside a request (tests): nothing is cached to refresh
  }
  return { ok: true };
}
