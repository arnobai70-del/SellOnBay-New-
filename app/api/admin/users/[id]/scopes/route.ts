import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { AuditError } from '@/lib/admin/audit';
import { setAdminScopes } from '@/lib/admin/scopeStore';
import { idOf, readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';
import { jsonT } from '@/lib/i18n/jsonT';

export const runtime = 'nodejs';
const schema = z.object({ scopes: z.string().max(200), reason: z.string().max(500).default('') });

/* A Super Admin sets an admin account's permissions ("finance, delivery"). Audited before it is saved. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly('super');
  if (!a.ok) return a.res;
  const id = await idOf(params);
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const scopes = body.data.scopes
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  try {
    const r = await setAdminScopes(a.id, id, scopes, body.data.reason);
    return r.ok ? NextResponse.json({ ok: true }) : jsonT({ error: r.error }, { status: r.status });
  } catch (e) {
    if (e instanceof AuditError) return jsonT({ error: e.message }, { status: 503 });
    throw e;
  }
}
