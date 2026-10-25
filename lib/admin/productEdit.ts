import 'server-only';
import { revalidatePath } from 'next/cache';
import { CONFIG } from '../config';
import { BUCKET } from '../demoStore';
import { forgetLiveProducts } from '../catalog';
import { checkProductEdit, type ProductEditInput } from '../productEditRules';
import { getSettings } from '../settings';
import { supabaseConfigured } from '../supabase/env';
import { createAdminClient } from '../supabase/server';
import { FUNDED_STATES } from '../orders/machine';
import { audit } from './audit';

/*
 * An admin changes a seller's listing: words, category, price, delivery time, links, extras' prices and the app screenshots. The same limits as the
 * seller's form (lib/productEditRules.ts). Orders already placed keep the promise they were made under (the order snapshot), so a price change only
 * affects new orders. Every change is audited with the values before and after. The private code link, licence and owner are never touched here.
 */
export type Result = { ok: true } | { ok: false; status: number; error: string };
const COLS =
  'id, slug, platform, status, demo_path, app_shots, name, category, description, includes, price_cents, delivery_days, demo_url, sample_url, docs_url, requirements, express_price_cents, setup_price_cents, custom_price_cents, support_days, update_days, code_url, licence_type';

export type ProductForEdit = {
  id: string;
  slug: string;
  platform: string;
  status: string;
  demo_path: string | null;
  app_shots: string[] | null;
  name: string;
  category: string;
  description: string;
  includes: string[];
  price_cents: number;
  delivery_days: number;
  demo_url: string;
  sample_url: string | null;
  docs_url: string | null;
  requirements: string | null;
  express_price_cents: number | null;
  setup_price_cents: number;
  custom_price_cents: number;
  support_days: number;
  update_days: number;
  code_url: string | null;
  licence_type: string | null;
};

export async function productForEdit(slug: string): Promise<ProductForEdit | null> {
  if (!supabaseConfigured) return null;
  const { data } = await createAdminClient().from('products').select(COLS).eq('slug', slug).maybeSingle();
  return (data as ProductForEdit | null) ?? null;
}

const done = (slug: string) => {
  forgetLiveProducts();
  try {
    revalidatePath(`/product/${slug}`);
    revalidatePath('/sitemap.xml');
  } catch {
    // outside a request (tests)
  }
};

export async function adminEditProduct(adminId: string | null, slug: string, input: ProductEditInput): Promise<Result> {
  const before = await productForEdit(slug);
  if (!before) return { ok: false, status: supabaseConfigured ? 404 : 503, error: supabaseConfigured ? 'No such listing.' : 'Editing listings needs the database.' };
  const lim = await getSettings();
  const c = checkProductEdit(input, { platform: before.platform, priceMinCents: lim.priceMinCents, priceMaxCents: lim.priceMaxCents, hasHostedDemo: !!before.demo_path });
  if (!c.ok) return { ok: false, status: 400, error: c.error };
  const same = (Object.keys(c.row) as (keyof typeof c.row)[]).every((k) => JSON.stringify(c.row[k]) === JSON.stringify((before as Record<string, unknown>)[k] ?? null));
  if (same) return { ok: false, status: 409, error: 'Nothing changed.' };
  // Buyers who paid already download the file behind the files link: it cannot be swapped under them (a digital product gets a new version instead).
  if (c.row.code_url !== undefined && c.row.code_url !== before.code_url) {
    const { count } = await createAdminClient()
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', before.id)
      .in('status', [...FUNDED_STATES]);
    if (count === null || count > 0) return { ok: false, status: 409, error: 'Buyers already have the files of this listing, so the files link cannot change. Publish a new version instead.' };
  }
  const { error } = await createAdminClient().from('products').update(c.row).eq('id', before.id);
  if (error) return { ok: false, status: 500, error: 'Could not save the listing.' };
  const diff = (Object.keys(c.row) as (keyof typeof c.row)[]).filter((k) => JSON.stringify(c.row[k]) !== JSON.stringify((before as Record<string, unknown>)[k] ?? null));
  await audit(adminId, 'listing_edited_by_admin', 'product', before.id, {
    slug,
    from: Object.fromEntries(diff.map((k) => [k, (before as Record<string, unknown>)[k] ?? null])),
    to: Object.fromEntries(diff.map((k) => [k, c.row[k]])),
  });
  done(slug);
  return { ok: true };
}

const MAX_SHOT = 4 * 1024 * 1024;
function sniff(b: Uint8Array): { ext: string; type: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: 'webp', type: 'image/webp' };
  return null;
}

/* Adds one screenshot to an app listing (PNG, JPEG or WebP up to 4 MB, checked by its bytes), up to the limit. */
export async function adminAddShot(adminId: string | null, slug: string, bytes: Uint8Array): Promise<Result> {
  const p = await productForEdit(slug);
  if (!p) return { ok: false, status: 404, error: 'No such listing.' };
  const shots = p.app_shots ?? [];
  if (shots.length >= CONFIG.listing.maxShots) return { ok: false, status: 400, error: `At most ${CONFIG.listing.maxShots} screenshots.` };
  if (bytes.length > MAX_SHOT) return { ok: false, status: 413, error: 'The picture is larger than 4 MB.' };
  const kind = sniff(bytes);
  if (!kind) return { ok: false, status: 400, error: 'Use a PNG, JPEG or WebP picture.' };
  const used = shots.map((n) => Number(/shots\/(\d+)\./.exec(n)?.[1] ?? 0));
  const name = `shots/${Math.max(0, ...used) + 1}.${kind.ext}`;
  const db = createAdminClient();
  const { error } = await db.storage.from(BUCKET).upload(`${p.id}/${name}`, bytes, { contentType: kind.type, upsert: false });
  if (error) return { ok: false, status: 500, error: 'Could not store the picture.' };
  const next = [...shots, name];
  const { error: e2 } = await db
    .from('products')
    // A website keeps its own demo (zip or link); its pictures only sit beside it.
    .update(p.platform === 'web' ? { app_shots: next } : { demo_path: p.demo_path ?? p.id, app_shots: next, demo_files: next.length })
    .eq('id', p.id);
  if (e2) {
    await db.storage.from(BUCKET).remove([`${p.id}/${name}`]);
    return { ok: false, status: 500, error: 'Could not save the picture.' };
  }
  await audit(adminId, 'listing_shot_added', 'product', p.id, { slug, name });
  done(slug);
  return { ok: true };
}

export async function adminRemoveShot(adminId: string | null, slug: string, name: string): Promise<Result> {
  const p = await productForEdit(slug);
  if (!p) return { ok: false, status: 404, error: 'No such listing.' };
  const shots = p.app_shots ?? [];
  if (!shots.includes(name)) return { ok: false, status: 404, error: 'No such picture.' };
  const db = createAdminClient();
  const next = shots.filter((n) => n !== name);
  const { error } = await db
    .from('products')
    .update(p.platform === 'web' ? { app_shots: next } : { app_shots: next, demo_files: next.length })
    .eq('id', p.id);
  if (error) return { ok: false, status: 500, error: 'Could not save the change.' };
  await db.storage.from(BUCKET).remove([`${p.id}/${name}`]);
  await audit(adminId, 'listing_shot_removed', 'product', p.id, { slug, name });
  done(slug);
  return { ok: true };
}
