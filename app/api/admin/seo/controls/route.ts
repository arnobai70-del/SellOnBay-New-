import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { CONTROL_MAX } from '@/lib/seo/controls';
import { setPageControls } from '@/lib/seo/controlStore';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  path: z.string().max(100),
  status: z.enum(['published', 'draft', 'archived']),
  index: z.boolean(),
  follow: z.boolean(),
  sitemap: z.boolean(),
  canonical: z.string().max(CONTROL_MAX.canonical),
  ogTitle: z.string().max(CONTROL_MAX.ogTitle),
  ogDescription: z.string().max(CONTROL_MAX.ogDescription),
  ogImage: z.string().max(CONTROL_MAX.ogImage),
  ogImageAlt: z.string().max(CONTROL_MAX.imageAlt),
  focusKeyword: z.string().max(CONTROL_MAX.focusKeyword),
  keywords: z.string().max(CONTROL_MAX.keywords),
  content: z.string().max(CONTROL_MAX.content + 2000),
  related: z.array(z.string().max(80)).max(CONTROL_MAX.related),
  schema: z.boolean(),
  faqSchema: z.boolean(),
  faqs: z.array(z.object({ q: z.string().max(CONTROL_MAX.question), a: z.string().max(CONTROL_MAX.answer), draft: z.boolean().optional() })).max(CONTROL_MAX.faqs),
});

/* Saves publishing, search and FAQ settings for one public page. Admins only; audited with both versions. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { path, ...controls } = body.data;
  const r = await setPageControls(a.id, path, controls);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
