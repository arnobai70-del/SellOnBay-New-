import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { PAGE_SEO_MAX } from '@/lib/seo/pageList';
import { setPageSeo } from '@/lib/seo/pageMeta';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  path: z.string().max(100),
  title: z.string().max(PAGE_SEO_MAX.title),
  description: z.string().max(PAGE_SEO_MAX.description),
});

/* Saves the title and description Google shows for one public page (empty = the built-in words). Admins only; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await setPageSeo(a.id, body.data.path, { title: body.data.title, description: body.data.description });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
