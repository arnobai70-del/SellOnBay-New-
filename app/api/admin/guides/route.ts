import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { postById, saveRevision, savePost } from '@/lib/posts';
import type { Post } from '@/lib/postRules';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.object({
  id: z.string().max(40).nullable().optional(),
  action: z.enum(['draft', 'publish', 'schedule', 'unpublish']),
  autosave: z.boolean().default(false),
  title: z.string().max(120),
  slug: z.string().max(80).default(''),
  excerpt: z.string().max(300).default(''),
  metaTitle: z.string().max(70).default(''),
  metaDescription: z.string().max(170).default(''),
  coverUrl: z.string().max(500).default(''),
  coverAlt: z.string().max(150).default(''),
  ogImage: z.string().max(500).default(''),
  canonical: z.string().max(500).default(''),
  category: z.string().max(60).default(''),
  tags: z.array(z.string().max(30)).max(12).default([]),
  author: z.string().max(80).default(''),
  noindex: z.boolean().default(false),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  bodyHtml: z.string().max(400_000),
  bodyJson: z.unknown().optional(),
});
const STATUS: Record<string, Post['status']> = { draft: 'draft', publish: 'published', schedule: 'scheduled', unpublish: 'unpublished' };

/*
 * Admin › Content › Guides (owner, 2026-11-08): save a draft (also every few seconds as an autosave), publish, schedule or unpublish. Content
 * admins and Super Admins; every save is audited (lib/posts.ts) and keeps a revision. The HTML is cleaned on the server before it is stored.
 */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const before = d.id ? await postById(d.id) : null;
  if (d.id && !before) return NextResponse.json({ error: 'Guide not found.' }, { status: 404 });
  // An autosave never changes what is on the site: it keeps the guide's state and only stores the words.
  const status = d.autosave ? (before?.status ?? 'draft') : STATUS[d.action];
  const publishAt = d.action === 'schedule' ? (d.publishAt ? Date.parse(d.publishAt) : null) : before?.publishAt;
  if (!d.autosave && d.action === 'schedule' && (!publishAt || publishAt <= Date.now())) return NextResponse.json({ error: 'Choose a time in the future.' }, { status: 400 });
  const r = await savePost(a.id, before?.id ?? null, {
    slug: d.slug,
    title: d.title,
    metaTitle: d.metaTitle,
    metaDescription: d.metaDescription,
    excerpt: d.excerpt,
    body: before?.body ?? '',
    coverUrl: d.coverUrl,
    coverAlt: d.coverAlt,
    status,
    noindex: d.noindex,
    bodyHtml: d.bodyHtml,
    bodyJson: d.bodyJson ?? null,
    category: d.category,
    tags: d.tags,
    author: d.author,
    ogImage: d.ogImage,
    canonical: d.canonical,
    publishAt: publishAt ?? undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await saveRevision(a.id, r.value, d.autosave);
  return NextResponse.json({ ok: true, id: r.value.id, slug: r.value.slug, status: r.value.status, savedAt: r.value.updatedAt });
}
