import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminOnly } from '@/lib/admin/guard';
import { MAINTENANCE_LIMITS, MODULE_KEYS } from '@/lib/maintenance/config';
import { maintenanceHistory, moduleStates, setModule } from '@/lib/maintenance/service';
import { readJson } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const when = z.string().datetime({ offset: true }).nullable().optional();
const schema = z.object({
  module: z.enum(MODULE_KEYS as [string, ...string[]]),
  enabled: z.boolean(),
  message: z.string().max(MAINTENANCE_LIMITS.message).default(''),
  startAt: when,
  endAt: when,
});
const ms = (s: string | null | undefined) => (s ? Date.parse(s) : null);

/* Which modules are in maintenance, and the last changes. Admins only. Never closed itself (lib/maintenance/config.ts ALWAYS_ON_API). */
export async function GET() {
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const [{ modules, source }, history] = await Promise.all([moduleStates(), maintenanceHistory(50)]);
  return NextResponse.json({ modules, history, source }, { headers: { 'cache-control': 'no-store' } });
}

/* Put one module into maintenance, plan it, or end it. Admins only; audited, and the database keeps its own history. */
export async function POST(req: Request) {
  const a = await adminOnly();
  if (!a.ok) return a.res;
  const body = await readJson(req, schema);
  if (!body.ok) return body.res;
  const d = body.data;
  const r = await setModule(a.id, d.module, { enabled: d.enabled, message: d.message, startAt: ms(d.startAt), endAt: ms(d.endAt) });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
