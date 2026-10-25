import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { setAssignment, setHubLimit, setHubSlug } from '@/lib/seo/hubStore';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.union([
  z.object({ productId: z.string().max(80), to: z.string().max(40) }),
  z.object({ hub: z.string().max(40), limit: z.coerce.number().int() }),
  z.object({ hub: z.string().max(40), slug: z.string().max(61) }),
]);

/* Chooses which template category a listing belongs to (auto = the automatic rule, none = keep it out), or how many a category shows. Admins only; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const r = 'productId' in d ? await setAssignment(a.id, d.productId, d.to) : 'slug' in d ? await setHubSlug(a.id, d.hub, d.slug) : await setHubLimit(a.id, d.hub, d.limit);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
