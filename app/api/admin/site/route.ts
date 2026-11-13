import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceFor } from '@/lib/maintenance/service';
import { saveSite } from '@/lib/site/contentStore';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';
import { tx } from '@/lib/i18n/tx';

export const runtime = 'nodejs';
const schema = z.object({ kind: z.enum(['menu', 'footer', 'blocks', 'sections', 'social']), path: z.string().max(200).optional(), value: z.unknown().optional(), reset: z.boolean().optional() });

/* Save the top menu, the footer or the blocks of one page. `reset` takes the saved version away, so the built-in one shows again. Admins only; every change is in the audit log. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('content');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const { kind, path, value, reset } = body.data;
  // Social links moved to Admin › Settings › Contact & social, a Super Admin setting (owner, 2026-11-08).
  if (kind === 'social' && !a.scopes.includes('super')) return jsonT({ error: tx('Only a Super Admin can change the social links.') }, { status: 403 });
  const r = await saveSite(a.id, kind, reset ? [] : value, path);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
