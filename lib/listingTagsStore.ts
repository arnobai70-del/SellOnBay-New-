import 'server-only';
import { supabaseConfigured } from './supabase/env';
import { adminClientAvailable, createAdminClient } from './supabase/server';

/*
 * Listing tags in the database (migration 0070). Until that migration is applied the column does not exist: the form hides the field,
 * the listings route leaves tags out, and search goes on without them. The answer is kept once the column is there, and re-asked every
 * 30 seconds while it is not.
 */
const g = globalThis as { __tagsCol?: { ok: boolean; at: number } };
export async function hasTags(): Promise<boolean> {
  if (!supabaseConfigured || !adminClientAvailable()) return false; // no database: nowhere to keep tags
  const k = g.__tagsCol;
  if (k && (k.ok || Date.now() - k.at < 30_000)) return k.ok;
  let error: { message: string } | null;
  try {
    ({ error } = await createAdminClient().from('products').select('tags').limit(1));
  } catch {
    return false; // the database is not answering: do not remember
  }
  if (error && !/tags/.test(error.message)) return false; // some other failure: do not remember
  if (error) console.warn('products: apply migration 0070 for listing tags');
  g.__tagsCol = { ok: !error, at: Date.now() };
  return !error;
}

/* The tags of live listings, by slug, for site search. Empty when tags are not available or cannot be read (search still works without them). */
export async function liveTagsBySlug(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!(await hasTags())) return out;
  const { data, error } = await createAdminClient().from('products').select('slug, tags').eq('status', 'live').not('tags', 'is', null).limit(5000);
  if (error) {
    console.error('products: could not read listing tags for search', error.message);
    return out;
  }
  for (const r of (data ?? []) as { slug: string; tags: string[] | null }[]) if (r.tags?.length) out.set(r.slug, r.tags);
  return out;
}
