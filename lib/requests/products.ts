import 'server-only';
import { expressHelps } from '../deliveryTime';
import { versionsOf } from '../files/store';
import { orderStore } from '../orders/store';
import { createAdminClient } from '../supabase/server';
import type { ListingPrice } from './rules';

/*
 * The facts about a listing that a request and a quotation need. A product can be requested only when it is live and has at least one
 * approved, version-pinned source file (lib/files): legacy listings wait until their file has been imported, checked and approved (F-15).
 */
export type RequestableProduct = ListingPrice & {
  id: string;
  slug: string;
  sellerId: string;
  ownerType: 'seller' | 'platform';
  status: string;
  platform: string;
  deliveryType: 'live_site' | 'download' | 'repo_access';
  deliveryDays: number;
  deliveryHours: number | null;
  supportDays: number;
  updateDays: number;
  latestVersionId: string | null;
};

const memProducts: Map<string, RequestableProduct> = ((globalThis as { __reqProducts?: Map<string, RequestableProduct> }).__reqProducts ??= new Map());
/* Tests only. */
export const memRequestable = (p: RequestableProduct) => {
  memProducts.set(p.id, p);
  memProducts.set(p.slug, p);
};

const deliveryOf = (platform: string, deliveryType: string | null): RequestableProduct['deliveryType'] =>
  deliveryType === 'repo_access' ? 'repo_access' : platform === 'web' || platform === 'webapp' ? 'live_site' : 'download';

export async function requestableProduct(idOrSlug: string): Promise<RequestableProduct | null> {
  if ((await orderStore()).kind !== 'postgres') return memProducts.get(idOrSlug) ?? null;
  const col = /^[0-9a-f-]{36}$/i.test(idOrSlug) ? 'id' : 'slug';
  const { data: p } = await createAdminClient()
    .from('products')
    .select(
      'id, slug, name, seller_id, owner_type, status, platform, price_cents, setup_price_cents, custom_price_cents, express_price_cents, delivery_days, delivery_hours, delivery_type, support_days, update_days',
    )
    .eq(col, idOrSlug)
    .maybeSingle();
  if (!p) return null;
  const latest = (await versionsOf(p.id))[0] ?? null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    sellerId: p.seller_id,
    ownerType: p.owner_type === 'platform' ? 'platform' : 'seller',
    status: p.status,
    platform: p.platform ?? 'web',
    deliveryType: deliveryOf(p.platform ?? 'web', p.delivery_type),
    deliveryDays: p.delivery_days,
    deliveryHours: p.delivery_hours ?? null,
    supportDays: p.support_days ?? 0,
    updateDays: p.update_days ?? 0,
    priceCents: p.price_cents,
    setupCents: p.setup_price_cents ?? null,
    customCents: p.custom_price_cents ?? null,
    expressCents: p.express_price_cents ?? null,
    expressHelps: expressHelps({ days: p.delivery_days, hours: p.delivery_hours }),
    latestVersionId: latest?.id ?? null,
  };
}

/* Why this product cannot be requested now, or null. */
export function requestableProblem(p: RequestableProduct | null): string | null {
  if (!p || p.status !== 'live') return 'This product is not available.';
  if (!p.latestVersionId) return 'This product is being prepared and cannot be requested yet.';
  return null;
}
