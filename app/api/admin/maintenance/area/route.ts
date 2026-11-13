import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { MODULE_KEYS } from '@/lib/maintenance/config';
import { maintenanceForm } from '@/lib/maintenance/form';
import { setModule } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = maintenanceForm.extend({ module: z.enum(MODULE_KEYS as [string, ...string[]]) });

/* Close, plan or open one area, the whole site included (Admin › Settings › Maintenance). Super Admin; audited. Never closed itself. */
export async function POST(req: Request) {
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const r = await setModule(a.id, d.module, { enabled: d.enabled, message: d.message, startAt: d.startAt, endAt: d.endAt, bannerMinutes: d.bannerMinutes });
  return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
}
