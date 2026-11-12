import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { setFlag } from '@/lib/featureFlags';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.object({
  key: z.string().max(60),
  on: z.union([z.boolean(), z.enum(['on', 'off']).transform((v) => v === 'on')]),
  reason: z.string().max(500).default(''),
});

/* Switches one optional feature (lib/featureFlagRegistry.ts). Super Admin only; reason required; audited before the change is made. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  try {
    const r = await setFlag(a.id, body.data.key, body.data.on, body.data.reason);
    return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return jsonT({ error: e.message }, { status: 503 });
    throw e;
  }
}
