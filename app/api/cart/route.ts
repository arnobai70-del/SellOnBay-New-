import { NextResponse } from 'next/server';
import { z } from 'zod';
import { betaEligible } from '@/lib/beta/rules';
import { productRecord } from '@/lib/catalog';
import { examplesBuyable } from '@/lib/examples';
import { publicListing } from '@/lib/glass/words';
import { maintenanceFor } from '@/lib/maintenance/service';
import { priceDisplays } from '@/lib/prices/service';
import { getSettings } from '@/lib/settings';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({ ids: z.array(z.string().min(1).max(200)).max(5) });

/* What a cart holds, read fresh from the server: names and prices never come from the browser. Listings that are gone are simply not returned. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('cart');
  if (closed) return closed;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { paymentsMode } = await getSettings();
  const found = await Promise.all(body.data.ids.map((id) => productRecord(id)));
  const prices = await priceDisplays(found.flatMap((f) => (f ? [f.product] : []))).catch(() => new Map()); // a running launch price or sale (lib/prices)
  const items = found.flatMap((f) => {
    if (!f || f.status !== 'live') return [];
    const p = publicListing(f.product);
    const d = p.dbId ? prices.get(p.dbId) : undefined;
    return [
      {
        id: p.id,
        name: p.name,
        seller: p.seller,
        priceCents: Math.round(p.price * 100),
        wasCents: d?.wasCents ?? null,
        priceNote: d?.note ?? null,
        requestable: paymentsMode !== 'beta_free' || (p.sellerId ? betaEligible(p) : examplesBuyable()),
      },
    ];
  });
  return NextResponse.json({ items, beta: paymentsMode === 'beta_free' });
}
