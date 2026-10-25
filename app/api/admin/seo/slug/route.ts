import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { renameListingSlug } from '@/lib/seo/slug';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ slug: z.string().max(80), newSlug: z.string().max(80) });

/* Changes a seller listing's address (the old one redirects to the new). Admins only; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await renameListingSlug(a.id, body.data.slug.trim(), body.data.newSlug.trim().toLowerCase());
  return r.ok ? NextResponse.json({ ok: true, to: r.to }) : NextResponse.json({ error: r.error }, { status: r.status });
}
