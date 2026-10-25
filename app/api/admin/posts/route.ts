import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { LIMITS, deletePost, savePost } from '@/lib/posts';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const text = (max: number) => z.string().max(max).default('');
const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    id: z.string().max(64).nullable().default(null),
    title: z.string().max(LIMITS.title),
    slug: text(LIMITS.slug),
    metaTitle: text(LIMITS.metaTitle),
    metaDescription: text(LIMITS.metaDescription),
    excerpt: text(LIMITS.excerpt),
    body: text(LIMITS.body),
    coverUrl: text(500),
    coverAlt: text(LIMITS.coverAlt),
    status: z.enum(['draft', 'published']),
    noindex: z.boolean().default(false),
  }),
  z.object({ action: z.literal('delete'), id: z.string().min(1).max(64) }),
]);

/* Saves (creates, edits, publishes, unpublishes) or deletes a post. Admins only; every change is in the audit log. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('seo'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  if (d.action === 'delete') {
    const r = await deletePost(a.id, d.id);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  const { action: _a, id, ...input } = d;
  const r = await savePost(a.id, id, input);
  return r.ok ? NextResponse.json({ ok: true, id: r.value.id, slug: r.value.slug }) : NextResponse.json({ error: r.error }, { status: r.status });
}
