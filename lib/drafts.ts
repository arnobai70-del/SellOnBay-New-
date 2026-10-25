import 'server-only';
import { createAdminClient } from './supabase/server';

export type Draft = { slug: string; name: string; platform: string; updated_at: string };

/* A seller's saved drafts, newest first. Drafts are never public. */
export async function draftsFor(sellerId: string): Promise<Draft[]> {
  const { data } = await createAdminClient()
    .from('products')
    .select('slug, name, platform, updated_at')
    .eq('seller_id', sellerId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(20);
  return (data ?? []) as Draft[];
}
