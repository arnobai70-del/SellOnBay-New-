import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { PAGE_WORDS_MAX } from '@/lib/seo/pageList';
import { setPageWords } from '@/lib/seo/pageWords';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({
  path: z.string().max(100),
  heading: z.string().max(PAGE_WORDS_MAX.heading + 20),
  intro: z.string().max(PAGE_WORDS_MAX.intro + 20),
  body: z.string().max(PAGE_WORDS_MAX.body + 2_000),
});

/* Saves the heading, intro and (policy pages) page text an admin rewrote for one public page (empty = the built-in words). Admins only; audited. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await setPageWords(a.id, body.data.path, { heading: body.data.heading, intro: body.data.intro, body: body.data.body });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
