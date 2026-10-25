import { NextResponse } from 'next/server';
import { adminOnly } from '@/lib/admin/guard';
import { processDeletion } from '@/lib/privacy';
import { idOf } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';

/* Process a deletion request: the account is anonymised and locked (see lib/privacy.ts). Refused while anything is still open. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const r = await processDeletion(a.id, await idOf(params));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
