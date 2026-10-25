import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { removeFakeAccount, removeFakeReview, removeReviewsBy } from '@/lib/clean';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ what: z.enum(['account', 'review', 'reviews_by']), id: z.string().trim().min(1).max(64), note: z.string().max(500).default('') });

/* One-click clean-up: ban a fake account and remove its reviews and reports, remove them without the ban, or remove one review. Evidence (orders, chat, logs) is never deleted. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { what, id, note } = body.data;
  const r = what === 'account' ? await removeFakeAccount(a.id, id, note) : what === 'reviews_by' ? await removeReviewsBy(a.id, id, note) : await removeFakeReview(a.id, id, note);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
}
