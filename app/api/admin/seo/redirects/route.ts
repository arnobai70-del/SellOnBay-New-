import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { addRedirect, removeRedirect } from '@/lib/seo/redirectStore';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.union([z.object({ from: z.string().max(300), to: z.string().max(300), code: z.coerce.number().int() }), z.object({ remove: z.string().max(300) })]);

/* Adds, changes or removes an address change (a 301 or 302 from an old address to a new one). Admins only; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const r = 'remove' in d ? await removeRedirect(a.id, d.remove) : await addRedirect(a.id, { from: d.from, to: d.to, code: d.code === 302 ? 302 : 301 });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
