import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { rollback } from '@/lib/cms/restore';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.object({ key: z.string().min(1).max(300), version: z.coerce.number().int().min(1) });

/* Puts an older revision of a site-builder or SEO setting back (lib/cms). Content admins; the setting's own checks run again. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await rollback(a.id, body.data.key, body.data.version);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
