import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { setSeo } from '@/lib/seo/site';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  homeTitle: z.string().max(70).optional(),
  homeDescription: z.string().max(170).optional(),
  googleVerification: z.string().max(300).optional(),
  bingVerification: z.string().max(300).optional(),
});

/* Changes the search settings (home page title and description, Search Console and Bing codes). Admins only; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await setSeo(a.id, body.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
