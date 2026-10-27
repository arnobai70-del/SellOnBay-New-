import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { limit } from '@/lib/rateLimit';
import { startUpload } from '@/lib/files/service';
import { createAdminClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  product: z.string().min(1).max(80),
  purpose: z.enum(['listing', 'version']).default('listing'),
  name: z.string().min(1).max(200),
  size: z.coerce.number().int().positive(),
});

/*
 * A seller asks for a one-time upload link for a source archive of their own listing. The file goes straight into private quarantine; nothing
 * is public, and nothing is approved until it has passed the automatic checks and a human review.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('upload'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  if (!(await limit(`file-upload:${who.id}`, 20, 3_600_000))) return NextResponse.json({ error: 'Too many uploads this hour. Try again later.' }, { status: 429 });
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { data: p } = await createAdminClient().from('products').select('id, seller_id').eq('slug', body.data.product).maybeSingle();
  if (!p || p.seller_id !== who.id) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  const r = await startUpload(who.id, { productId: p.id, purpose: body.data.purpose, name: body.data.name, size: body.data.size });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, id: r.value.file.id, path: r.value.file.quarantinePath, token: r.value.token, uploadUrl: r.value.uploadUrl });
}
