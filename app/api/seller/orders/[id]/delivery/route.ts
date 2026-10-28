import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { submitDelivery } from '@/lib/release/service';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  note: z.string().max(2000),
  fileId: z
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

/* The seller sends a work order's delivery for release. SellOnBay checks it and approves the release; the buyer sees nothing before. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await submitDelivery(who.id, id, { note: body.data.note, fileId: body.data.fileId });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
