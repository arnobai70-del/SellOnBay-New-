import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { maintenanceForm } from '@/lib/maintenance/form';
import { setPage } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
const schema = z.union([z.object({ path: z.string().max(200), remove: z.literal(true) }), maintenanceForm.extend({ path: z.string().max(200) })]);

/* Close, plan, open or remove one page by its address (Admin › Settings › Maintenance). Super Admin; audited. Never closed itself. */
export async function POST(req: Request) {
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const r =
    'remove' in d ? await setPage(a.id, d.path, null) : await setPage(a.id, d.path, { enabled: d.enabled, message: d.message, startAt: d.startAt, endAt: d.endAt, bannerMinutes: d.bannerMinutes });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
