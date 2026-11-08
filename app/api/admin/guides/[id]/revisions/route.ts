import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { audit } from '@/lib/admin/audit';
import { maintenanceFor } from '@/lib/maintenance/service';
import { postById, revisions, saveRevision, savePost } from '@/lib/posts';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';

/* A guide's saved versions, newest first (Content admins). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const { id } = await params;
  const list = await revisions(id);
  return NextResponse.json({
    revisions: list.map((r) => ({
      id: r.id,
      title: r.title,
      autosave: r.autosave,
      at: r.at,
      words: r.bodyHtml
        .replace(/<[^>]+>/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length,
    })),
  });
}

/* Puts an older version back. The current words are kept as a version first, so a restore can itself be undone. Audited. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const { id } = await params;
  const body = await readJson(req, z.object({ revisionId: z.number().int() }));
  if (!body.ok) return body.res;
  const p = await postById(id);
  const rev = (await revisions(id)).find((r) => r.id === body.data.revisionId);
  if (!p || !rev) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  await saveRevision(a.id, p, false);
  const r = await savePost(a.id, p.id, { ...p, title: rev.title, bodyHtml: rev.bodyHtml, bodyJson: rev.bodyJson });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await audit(a.id, 'post_revision_restored', 'post', p.id, { revision: rev.id });
  return NextResponse.json({ ok: true });
}
