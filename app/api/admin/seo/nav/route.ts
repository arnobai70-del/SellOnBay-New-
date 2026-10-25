import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { setNavConfig } from '@/lib/seo/navStore';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ hidden: z.array(z.string().max(40)).max(40), order: z.array(z.string().max(40)).max(40) });

/* Saves which category-bar entries show and in what order. Admins only; audited. Help can never be hidden. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await setNavConfig(a.id, body.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
