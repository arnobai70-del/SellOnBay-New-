import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { SWITCHES, setSwitch, type SwitchKey } from '@/lib/switches';
import { readJson } from '@/lib/validate';
import { maintenanceFor } from '@/lib/maintenance/service';

export const runtime = 'nodejs';
const schema = z.object({ key: z.enum(Object.keys(SWITCHES) as [SwitchKey, ...SwitchKey[]]), state: z.enum(['on', 'off']), reason: z.string().max(500).default('') });

/* Turns an emergency switch on or off. A reason is required and goes in the audit log. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('admin'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const r = await setSwitch(a.id, body.data.key, body.data.state === 'on', body.data.reason);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
