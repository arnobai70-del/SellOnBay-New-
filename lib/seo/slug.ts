import 'server-only';
import { revalidatePath } from 'next/cache';
import { audit } from '../admin/audit';
import { ALL_PRODUCTS } from '../apps';
import { forgetLiveProducts } from '../catalog';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import { forgetClosedProducts } from './closed';
import { addRedirect } from './redirectStore';

/*
 * Changes the address of a seller listing (/product/<slug>). Orders, downloads and licences belong to the listing's id, not its address, so they keep
 * working. The old address is sent to the new one with a 301, the admin's saved search words and settings move with it, and the change is audited.
 * Built-in pages keep their addresses (they are part of the site); move one of those with a redirect instead.
 */
export const SLUG = /^[a-z0-9][a-z0-9-]{2,60}$/;
type Result = { ok: true; to: string } | { ok: false; status: number; error: string };

export function slugProblem(slug: string): string | null {
  if (!SLUG.test(slug)) return 'Use 3 to 61 lowercase letters, numbers and dashes, starting with a letter or number.';
  if (/--/.test(slug) || slug.endsWith('-')) return 'No double dashes, and do not end with a dash.';
  return null;
}

const MOVED = ['seo:page:', 'seo:ctl:'];

export async function renameListingSlug(adminId: string | null, oldSlug: string, newSlug: string): Promise<Result> {
  const bad = slugProblem(newSlug);
  if (bad) return { ok: false, status: 400, error: bad };
  if (newSlug === oldSlug) return { ok: false, status: 409, error: 'Nothing changed.' };
  if (!supabaseConfigured || ALL_PRODUCTS.some((p) => p.id === oldSlug)) return { ok: false, status: 400, error: 'Only a seller listing can be renamed.' };
  const db = createAdminClient();
  const { data: row } = await db.from('products').select('id, slug').eq('slug', oldSlug).maybeSingle();
  if (!row) return { ok: false, status: 404, error: 'No such listing.' };
  const { data: clash } = await db.from('products').select('id').eq('slug', newSlug).maybeSingle();
  if (clash || ALL_PRODUCTS.some((p) => p.id === newSlug)) return { ok: false, status: 409, error: 'That address is already used by another listing.' };
  const { error } = await db.from('products').update({ slug: newSlug }).eq('id', row.id);
  if (error) return { ok: false, status: 500, error: 'Could not change the address.' };
  // The admin's words and settings for the old address move to the new one.
  for (const prefix of MOVED) {
    const { data } = await db.from('app_settings').select('value').eq('key', `${prefix}/product/${oldSlug}`).maybeSingle();
    if (data) {
      await db.from('app_settings').upsert({ key: `${prefix}/product/${newSlug}`, value: data.value, changed_at: new Date().toISOString() });
      await db.from('app_settings').delete().eq('key', `${prefix}/product/${oldSlug}`);
    }
  }
  await addRedirect(adminId, { from: `/product/${oldSlug}`, to: `/product/${newSlug}`, code: 301 });
  await addRedirect(adminId, { from: `/preview/${oldSlug}`, to: `/preview/${newSlug}`, code: 301 });
  forgetLiveProducts();
  forgetClosedProducts();
  await audit(adminId, 'listing_slug_changed', 'product', String(row.id), { from: oldSlug, to: newSlug });
  try {
    revalidatePath(`/product/${newSlug}`);
    revalidatePath('/sitemap.xml');
  } catch {
    // outside a request (tests)
  }
  return { ok: true, to: `/product/${newSlug}` };
}
