import 'server-only';
import { audit } from './admin/audit';
import { postProblem, slugify, type Post, type PostInput } from './postRules';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';

/*
 * Posts (blog and guides) written by admins at /dashboard/admin/seo. Each has its own address (slug), meta title and meta description, so it can
 * rank on its own in search. Drafts are visible only in the admin panel; published posts are at /blog/<slug>, in the sitemap and in the feed.
 * Stored in `posts` (migration 0048) and in memory without a database.
 */
export { GOOD, LIMITS, descriptionOf, postProblem, seoHints, slugify, type Post, type PostInput } from './postRules';
export type Result<T = Post> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

type Row = {
  id: string;
  slug: string;
  title: string;
  meta_title: string | null;
  meta_description: string | null;
  excerpt: string;
  body: string;
  cover_url: string | null;
  cover_alt: string;
  status: 'draft' | 'published';
  noindex: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
const fromRow = (r: Row): Post => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  metaTitle: r.meta_title ?? '',
  metaDescription: r.meta_description ?? '',
  excerpt: r.excerpt,
  body: r.body,
  coverUrl: r.cover_url ?? '',
  coverAlt: r.cover_alt,
  status: r.status,
  noindex: r.noindex,
  publishedAt: r.published_at ? Date.parse(r.published_at) : undefined,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
});
const toRow = (p: PostInput) => ({
  slug: p.slug,
  title: p.title.trim(),
  meta_title: p.metaTitle.trim() || null,
  meta_description: p.metaDescription.trim() || null,
  excerpt: p.excerpt.trim(),
  body: p.body,
  cover_url: p.coverUrl.trim() || null,
  cover_alt: p.coverAlt.trim(),
  status: p.status,
  noindex: p.noindex,
});

const mem: { posts: Post[] } = ((globalThis as { __postsMem?: { posts: Post[] } }).__postsMem ??= { posts: [] });
let ready: { ok: boolean; at: number } | undefined;
/* Postgres when the database and migration 0048 are there; memory otherwise (probed again every 30 seconds while missing). */
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('posts').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Published posts, newest first. */
export async function publishedPosts(limit = 200): Promise<Post[]> {
  // The blog list shows empty rather than failing while the database cannot be reached.
  if (await pg().catch(() => false)) {
    const { data } = await createAdminClient().from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(fromRow);
  }
  return mem.posts
    .filter((p) => p.status === 'published')
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, limit);
}

export async function publishedPost(slug: string): Promise<Post | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  if (await pg()) {
    const { data } = await createAdminClient().from('posts').select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
    return data ? fromRow(data as Row) : null;
  }
  return mem.posts.find((p) => p.slug === slug && p.status === 'published') ?? null;
}

/* Every post, for the admin panel, last changed first. */
export async function allPosts(): Promise<Post[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('posts').select('*').order('updated_at', { ascending: false }).limit(500);
    return ((data ?? []) as Row[]).map(fromRow);
  }
  return [...mem.posts].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function postById(id: string): Promise<Post | null> {
  if (await pg()) {
    if (!UUID.test(id)) return null;
    const { data } = await createAdminClient().from('posts').select('*').eq('id', id).maybeSingle();
    return data ? fromRow(data as Row) : null;
  }
  return mem.posts.find((p) => p.id === id) ?? null;
}

/* Creates a post (no id) or changes one. The first time a post is published it gets its date; it keeps it when edited later. */
export async function savePost(adminId: string | null, id: string | null, input: PostInput, now = Date.now()): Promise<Result> {
  const p: PostInput = { ...input, slug: input.slug || slugify(input.title) };
  const bad = postProblem(p);
  if (bad) return fail(400, bad);
  const before = id ? await postById(id) : null;
  if (id && !before) return fail(404, 'Post not found.');
  const publishedAt = p.status === 'published' ? (before?.publishedAt ?? now) : before?.publishedAt;
  const wasStatus = before?.status; // read now: in memory the saved post is the same object
  let saved: Post;
  if (await pg()) {
    const row = { ...toRow(p), published_at: publishedAt ? new Date(publishedAt).toISOString() : null, updated_at: new Date(now).toISOString() };
    const q = before
      ? createAdminClient().from('posts').update(row).eq('id', before.id).select('*').single()
      : createAdminClient()
          .from('posts')
          .insert({ ...row, created_by: UUID.test(adminId ?? '') ? adminId : null })
          .select('*')
          .single();
    const { data, error } = await q;
    if (error) return error.code === '23505' ? fail(409, 'Another post already uses this address. Change the address.') : fail(500, 'Could not save the post.');
    saved = fromRow(data as Row);
  } else {
    if (mem.posts.some((x) => x.slug === p.slug && x.id !== before?.id)) return fail(409, 'Another post already uses this address. Change the address.');
    const clean = {
      ...p,
      title: p.title.trim(),
      metaTitle: p.metaTitle.trim(),
      metaDescription: p.metaDescription.trim(),
      excerpt: p.excerpt.trim(),
      coverUrl: p.coverUrl.trim(),
      coverAlt: p.coverAlt.trim(),
    };
    saved = before ? Object.assign(before, clean, { publishedAt, updatedAt: now }) : { ...clean, id: crypto.randomUUID(), publishedAt, createdAt: now, updatedAt: now };
    if (!before) mem.posts.push(saved);
  }
  const action = !before ? 'post_created' : wasStatus !== saved.status ? (saved.status === 'published' ? 'post_published' : 'post_unpublished') : 'post_edited';
  await audit(adminId, action, 'post', saved.id, { slug: saved.slug, title: saved.title });
  return { ok: true, value: saved };
}

export async function deletePost(adminId: string | null, id: string): Promise<Result<true>> {
  const before = await postById(id);
  if (!before) return fail(404, 'Post not found.');
  if (await pg()) {
    const { error } = await createAdminClient().from('posts').delete().eq('id', before.id);
    if (error) return fail(500, 'Could not delete the post.');
  } else mem.posts.splice(mem.posts.indexOf(before), 1);
  await audit(adminId, 'post_deleted', 'post', before.id, { slug: before.slug, title: before.title });
  return { ok: true, value: true };
}
