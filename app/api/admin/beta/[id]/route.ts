import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { decideBeta } from '@/lib/beta/service';
import { maintenanceFor } from '@/lib/maintenance/service';
import { idOf, readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.object({ decision: z.enum(['approve', 'decline']), reason: z.string().max(500).default('') });

/* Approves a free beta request (unlocks the files and domain steps) or declines it with a reason. Delivery decides releases; a Super Admin can too. Audited. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin');
  if (closed) return closed;
  const a = await adminOnly('delivery');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await decideBeta(a.id, await idOf(params), body.data.decision, body.data.reason);
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
