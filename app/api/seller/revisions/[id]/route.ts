import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sellerOnly } from '@/lib/auth/guards';
import { submitRevisionWork } from '@/lib/revisions/service';
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

/* The seller sends revised work for an assigned revision of their own order. It waits for SellOnBay's release approval (never automatic). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('orders'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const who = await sellerOnly();
  if (!who.ok) return who.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await submitRevisionWork(who.id, await idOf(params), body.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
